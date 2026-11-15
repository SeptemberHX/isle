// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian
//
// The way a place is found and the forecast read follows Daozai's weather.rs
// (https://github.com/Renly1994/xiaotang-daozai), MIT, Copyright (c) 2026 小唐的Token and Daozai contributors.

//! The weather: now and the week ahead for one place, from Open-Meteo (no key, no account), every quarter
//! of an hour while the extension wants it (Settings). The place is the one picked in Settings, or with none
//! picked the one the network's address is in (ipwho.is: the address is all it is told). Off, nothing is asked.

use std::sync::Arc;
use std::time::Duration;

use log::warn;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Notify;
use zbus::object_server::InterfaceRef;
use zbus::{fdo, interface};

use crate::clock::{now_ms, wait_until};
use crate::store::Store;

const FORECAST: &str = "https://api.open-meteo.com/v1/forecast";
const SEARCH: &str = "https://geocoding-api.open-meteo.com/v1/search";
const LOCATE: &str = "https://ipwho.is/";
const TIMEOUT: Duration = Duration::from_secs(12);
/// Open-Meteo's own "now" is new every quarter of an hour.
const EVERY_MS: i64 = 15 * 60 * 1000;
/// Where the network's address is, asked again after this long.
const LOCATED_FOR_MS: i64 = 3 * 3600 * 1000;
/// Asked by hand (Refresh), not sooner than this after the last look, whether it worked or failed.
const AGAIN_MS: i64 = 30 * 1000;
/// After failed looks, the next ones by themselves, in seconds: soon at first (the server is out of reach
/// for a minute now and then), then 2, 4, 8, 16 and every 30 minutes.
const RETRY_S: [i64; 7] = [20, 40, 120, 240, 480, 960, 1800];
const DAYS: usize = 7;
/// The places a search gives, at most.
const FOUND: usize = 8;
const MAX_NAME: usize = 80;

/// A place on the map, as Settings keep the one picked.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Place {
    /// Its name ("Hangzhou"), and what it is in ("Zhejiang · China").
    pub label: String,
    pub region: String,
    pub lat: f64,
    pub lon: f64,
}

impl Place {
    fn valid(&self) -> bool {
        !self.label.trim().is_empty()
            && (-90.0..=90.0).contains(&self.lat)
            && (-180.0..=180.0).contains(&self.lon)
    }

    /// Cut to what the island shows, on one line.
    fn tidy(mut self) -> Self {
        let line = |text: &str| -> String {
            text.split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .filter(|c| !c.is_control())
                .take(MAX_NAME)
                .collect()
        };
        self.label = line(&self.label);
        self.region = line(&self.region);
        self
    }
}

/// From Settings: whether to look, for which place (none: where the network is), and the language places
/// are named in ("zh", "en", "ru"…).
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(default)]
struct Config {
    enabled: bool,
    place: Option<Place>,
    lang: String,
}

/// One day of the week ahead.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
struct Day {
    /// "2026-11-13", the place's own date.
    date: String,
    high: f64,
    low: f64,
    /// WMO weather code.
    code: u8,
    /// Chance of rain or snow, percent.
    rain: u8,
}

/// The weather as last read.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
struct Report {
    place: Place,
    /// The place is where the network is, not one picked.
    auto: bool,
    /// °C; the wind in km/h, humidity in percent.
    temp: f64,
    feels: Option<f64>,
    humidity: Option<u8>,
    wind: Option<f64>,
    code: u8,
    /// The sun is up there.
    day: bool,
    /// Today's sunrise and sunset.
    sunrise_ms: Option<i64>,
    sunset_ms: Option<i64>,
    /// How far the place's clock is from UTC, in seconds.
    utc_offset: i64,
    days: Vec<Day>,
    at_ms: i64,
}

/// What is kept across restarts: the last report, and where the network was found to be.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
struct Kept {
    report: Option<Report>,
    located: Option<Place>,
    located_ms: i64,
    /// The language `located` is named in.
    located_lang: String,
}

/// What the island shows: the report (an older one while a look fails, or none yet), and why the last look
/// failed ("offline", "unreachable": the server did not answer, "place": where the network is could not be
/// told, "failed"), or "".
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
struct Shown {
    report: Option<Report>,
    error: String,
}

/// The Weather1 D-Bus object.
pub struct WeatherService {
    config: Config,
    shown: Shown,
    /// Asked by hand since the last look.
    asked: bool,
    wake: Arc<Notify>,
}

impl WeatherService {
    /// Starts off; the returned `Notify` wakes `run` when Settings change or a look is asked for.
    pub fn new() -> (Self, Arc<Notify>) {
        let wake = Arc::new(Notify::new());
        let service = Self {
            config: Config::default(),
            shown: Shown::default(),
            asked: false,
            wake: wake.clone(),
        };
        (service, wake)
    }
}

#[interface(name = "io.github.zickrian.isle.Weather1")]
impl WeatherService {
    /// JSON `{enabled, place: {label, region, lat, lon} | null, lang}`, from Settings.
    fn set_config(&mut self, config: &str) -> fdo::Result<()> {
        let mut config: Config =
            serde_json::from_str(config).map_err(|err| fdo::Error::InvalidArgs(err.to_string()))?;
        config.place = config.place.map(Place::tidy).filter(Place::valid);
        config.lang = language(&config.lang).to_owned();
        if config != self.config {
            self.config = config;
            self.wake.notify_one();
        }
        Ok(())
    }

    /// Looks again now, unless it just did.
    fn refresh(&mut self) {
        self.asked = true;
        self.wake.notify_one();
    }

    /// The places called `name`, as JSON `[{label, region, lat, lon}]`, the likeliest first; for Settings
    /// to pick one from. `lang` names them.
    async fn search(&self, name: &str, lang: &str) -> fdo::Result<String> {
        let name: String = name.trim().chars().take(MAX_NAME).collect();
        if name.chars().count() < 2 {
            return Ok("[]".into());
        }
        let lang = language(lang).to_owned();
        let found = tokio::task::spawn_blocking(move || search_places(&name, &lang))
            .await
            .map_err(|err| fdo::Error::Failed(err.to_string()))?
            .map_err(|err| fdo::Error::Failed(err.code().into()))?;
        Ok(serde_json::to_string(&found).unwrap_or_else(|_| "[]".into()))
    }

    /// JSON `{report: {place, auto, temp, feels, humidity, wind, code, day, sunrise_ms, sunset_ms,
    /// utc_offset, days: [{date, high, low, code, rain}], at_ms} | null, error}`.
    #[zbus(property)]
    fn weather(&self) -> String {
        serde_json::to_string(&self.shown).unwrap_or_default()
    }
}

/// Why a look failed.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Failure {
    Offline,
    /// Online, but the weather's server did not answer in time.
    Unreachable,
    /// Where the network is could not be told.
    Place,
    Failed,
}

impl Failure {
    fn code(self) -> &'static str {
        match self {
            Failure::Offline => "offline",
            Failure::Unreachable => "unreachable",
            Failure::Place => "place",
            Failure::Failed => "failed",
        }
    }
}

/// Looks every quarter of an hour while enabled, and when asked; sleeps otherwise.
pub async fn run(iface: InterfaceRef<WeatherService>, wake: Arc<Notify>) {
    let mut store: Store<Kept> = Store::new("weather");
    let mut kept = store.load();
    let mut looked_ms = 0;
    let mut failures = 0usize;
    let mut error = "";
    loop {
        let (config, asked) = {
            let mut service = iface.get_mut().await;
            (service.config.clone(), std::mem::take(&mut service.asked))
        };
        if !config.enabled {
            publish(&iface, Shown::default()).await;
            wake.notified().await;
            continue;
        }
        // The last report, if it is of the place wanted now.
        let report = kept.report.clone().filter(|report| match &config.place {
            Some(place) => !report.auto && report.place == *place,
            None => report.auto,
        });
        let now = now_ms();
        let age = report
            .as_ref()
            .map_or(i64::MAX, |report| now - report.at_ms);
        let since = now - looked_ms;
        let due = if asked {
            since >= AGAIN_MS
        } else if failures > 0 {
            since >= RETRY_S[(failures - 1).min(RETRY_S.len() - 1)] * 1000
        } else {
            age >= EVERY_MS
        };
        if due {
            let target = config.clone();
            let located = kept.located.clone().filter(|_| {
                now - kept.located_ms < LOCATED_FOR_MS && kept.located_lang == config.lang
            });
            let looked = tokio::task::spawn_blocking(move || look(&target, located)).await;
            looked_ms = now_ms();
            match looked {
                Ok(Ok((report, located))) => {
                    if let Some(place) = located {
                        kept.located = Some(place);
                        kept.located_ms = looked_ms;
                        kept.located_lang = config.lang.clone();
                    }
                    kept.report = Some(report.clone());
                    store.save(&kept);
                    failures = 0;
                    error = "";
                    publish(
                        &iface,
                        Shown {
                            report: Some(report),
                            error: String::new(),
                        },
                    )
                    .await;
                }
                Ok(Err(failure)) => {
                    failures += 1;
                    error = failure.code();
                    publish(
                        &iface,
                        Shown {
                            report,
                            error: error.into(),
                        },
                    )
                    .await;
                }
                Err(err) => {
                    warn!("the weather look stopped: {err}");
                    failures += 1;
                }
            }
        } else {
            publish(
                &iface,
                Shown {
                    report,
                    error: error.into(),
                },
            )
            .await;
        }
        let next = if failures > 0 {
            looked_ms + RETRY_S[(failures - 1).min(RETRY_S.len() - 1)] * 1000
        } else {
            kept.report
                .as_ref()
                .map_or(looked_ms, |report| report.at_ms)
                + EVERY_MS
        };
        // Until the next look is due, Settings change, or one is asked for.
        wait_until(Some(next.max(now_ms() + 1000)), &wake).await;
    }
}

/// Sets the `Weather` property, signalling only when it changed.
async fn publish(iface: &InterfaceRef<WeatherService>, shown: Shown) {
    let mut service = iface.get_mut().await;
    if service.shown == shown {
        return;
    }
    service.shown = shown;
    if let Err(err) = service.weather_changed(iface.signal_emitter()).await {
        warn!("could not publish the weather: {err}");
    }
}

/// One look: the place (the one picked, else `located` if still good, else found now), then its weather.
/// With the report, the place if it was found now.
fn look(config: &Config, located: Option<Place>) -> Result<(Report, Option<Place>), Failure> {
    let (place, found) = match (&config.place, located) {
        (Some(place), _) => (place.clone(), None),
        (None, Some(place)) => (place, None),
        (None, None) => {
            let place = locate(&config.lang)?;
            (place.clone(), Some(place))
        }
    };
    let reply = get(
        FORECAST,
        &[
            ("latitude", format!("{:.4}", place.lat)),
            ("longitude", format!("{:.4}", place.lon)),
            (
                "current",
                "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m".into(),
            ),
            (
                "daily",
                "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
                    .into(),
            ),
            ("timezone", "auto".into()),
            ("forecast_days", DAYS.to_string()),
        ],
    )?;
    let mut report = parse(&reply).ok_or(Failure::Failed)?;
    report.place = place;
    report.auto = config.place.is_none();
    Ok((report, found))
}

/// A GET of `url` with `query`, as JSON: through the desktop's proxy if it has one, and then once more
/// without it, should that way be the one out of reach.
fn get(url: &str, query: &[(&str, String)]) -> Result<Value, Failure> {
    let ways: &[bool] = if crate::http::has_desktop_proxy() {
        &[true, false]
    } else {
        &[false]
    };
    let mut failure = Failure::Offline;
    for &proxied in ways {
        let started = std::time::Instant::now();
        let request = if proxied {
            crate::http::get_through_desktop_proxy(url, TIMEOUT)
        } else {
            crate::http::get(url, TIMEOUT)
        };
        let mut request = request
            .header("User-Agent", concat!("Isle/", env!("CARGO_PKG_VERSION")))
            .header("Accept", "application/json");
        for (key, value) in query {
            request = request.query(key, value);
        }
        match request
            .call()
            .and_then(|mut reply| reply.body_mut().read_json())
        {
            Ok(reply) => return Ok(reply),
            Err(err) => {
                let way = if proxied {
                    "the desktop's proxy"
                } else {
                    "no proxy"
                };
                warn!(
                    "could not read {url} through {way} in {} ms: {err}",
                    started.elapsed().as_millis()
                );
                failure = match err {
                    // The server answered: asking again changes nothing.
                    ureq::Error::StatusCode(_) | ureq::Error::Json(_) => {
                        return Err(Failure::Failed);
                    }
                    ureq::Error::Timeout(_) => Failure::Unreachable,
                    _ => Failure::Offline,
                };
            }
        }
    }
    Err(failure)
}

/// The languages Open-Meteo names places in that Isle is in too; English otherwise.
fn language(lang: &str) -> &'static str {
    let lang = lang.to_ascii_lowercase();
    ["zh", "ru", "de", "fr", "es", "it", "pt", "ja", "ko"]
        .into_iter()
        .find(|known| lang.starts_with(known))
        .unwrap_or("en")
}

/// Where the network's address is.
fn locate(lang: &str) -> Result<Place, Failure> {
    // ipwho.is has its own names for a few languages.
    let lang = match lang {
        "zh" => "zh-CN",
        "pt" => "pt-BR",
        "ru" | "de" | "fr" | "es" | "ja" => lang,
        _ => "en",
    };
    let found = get(LOCATE, &[("lang", lang.into())]).map_err(|failure| match failure {
        Failure::Offline | Failure::Unreachable => failure,
        _ => Failure::Place,
    })?;
    if found["success"].as_bool() != Some(true) {
        return Err(Failure::Place);
    }
    let text = |key: &str| {
        found[key]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
    };
    let place = Place {
        label: text("city")
            .or_else(|| text("region"))
            .or_else(|| text("country"))
            .unwrap_or_default()
            .to_owned(),
        region: text("region").unwrap_or_default().to_owned(),
        lat: found["latitude"].as_f64().ok_or(Failure::Place)?,
        lon: found["longitude"].as_f64().ok_or(Failure::Place)?,
    }
    .tidy();
    if place.valid() {
        Ok(place)
    } else {
        Err(Failure::Place)
    }
}

/// The reply of Open-Meteo's forecast as a report, its place still to fill in.
fn parse(reply: &Value) -> Option<Report> {
    let current = &reply["current"];
    let daily = &reply["daily"];
    let utc_offset = reply["utc_offset_seconds"].as_i64().unwrap_or(0);
    let number = |list: &Value, index: usize| list[index].as_f64();
    let days: Vec<Day> = daily["time"]
        .as_array()?
        .iter()
        .enumerate()
        .take(DAYS)
        .filter_map(|(index, date)| {
            Some(Day {
                date: date.as_str()?.to_owned(),
                high: number(&daily["temperature_2m_max"], index)?,
                low: number(&daily["temperature_2m_min"], index)?,
                code: daily["weather_code"][index].as_u64().unwrap_or(2).min(255) as u8,
                rain: daily["precipitation_probability_max"][index]
                    .as_u64()
                    .unwrap_or(0)
                    .min(100) as u8,
            })
        })
        .collect();
    if days.is_empty() {
        return None;
    }
    // "2026-11-13T06:41", the place's own clock.
    let at = |list: &Value| {
        chrono::NaiveDateTime::parse_from_str(list[0].as_str()?, "%Y-%m-%dT%H:%M")
            .ok()
            .map(|time| (time.and_utc().timestamp() - utc_offset) * 1000)
    };
    Some(Report {
        temp: current["temperature_2m"].as_f64()?,
        feels: current["apparent_temperature"].as_f64(),
        humidity: current["relative_humidity_2m"]
            .as_f64()
            .map(|percent| percent.clamp(0.0, 100.0).round() as u8),
        wind: current["wind_speed_10m"].as_f64(),
        code: current["weather_code"].as_u64().unwrap_or(2).min(255) as u8,
        day: current["is_day"].as_u64() != Some(0),
        sunrise_ms: at(&daily["sunrise"]),
        sunset_ms: at(&daily["sunset"]),
        utc_offset,
        days,
        at_ms: now_ms(),
        ..Report::default()
    })
}

/// A Chinese place's kind, said after its name: "广州市" is also looked up as "广州", which is how the map
/// has many of them.
const KINDS: [char; 4] = ['市', '县', '区', '省'];

fn is_cjk(name: &str) -> bool {
    name.chars().all(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
}

/// The name without its kind, unless that leaves less than two characters ("津市").
fn base_name(name: &str) -> &str {
    match name.strip_suffix(KINDS) {
        Some(base) if is_cjk(name) && base.chars().count() >= 2 => base,
        _ => name,
    }
}

/// China's provinces and regions, each with its capital: the map has towns, not "新疆", so its capital is
/// looked up beside it.
const CAPITALS: [(&str, &str); 34] = [
    ("北京", "北京"),
    ("天津", "天津"),
    ("上海", "上海"),
    ("重庆", "重庆"),
    ("河北", "石家庄"),
    ("山西", "太原"),
    ("辽宁", "沈阳"),
    ("吉林", "长春"),
    ("黑龙江", "哈尔滨"),
    ("江苏", "南京"),
    ("浙江", "杭州"),
    ("安徽", "合肥"),
    ("福建", "福州"),
    ("江西", "南昌"),
    ("山东", "济南"),
    ("河南", "郑州"),
    ("湖北", "武汉"),
    ("湖南", "长沙"),
    ("广东", "广州"),
    ("海南", "海口"),
    ("四川", "成都"),
    ("贵州", "贵阳"),
    ("云南", "昆明"),
    ("陕西", "西安"),
    ("甘肃", "兰州"),
    ("青海", "西宁"),
    ("台湾", "台北"),
    ("内蒙古", "呼和浩特"),
    ("广西", "南宁"),
    ("西藏", "拉萨"),
    ("宁夏", "银川"),
    ("新疆", "乌鲁木齐"),
    ("香港", "香港"),
    ("澳门", "澳门"),
];

/// The capital of the province or region `name` is, by its short or its full name.
fn capital(name: &str) -> Option<&'static str> {
    let short = [
        "维吾尔自治区",
        "壮族自治区",
        "回族自治区",
        "自治区",
        "特别行政区",
        "省",
        "市",
    ]
    .iter()
    .find_map(|kind| name.strip_suffix(kind))
    .unwrap_or(name);
    CAPITALS
        .iter()
        .find(|(province, _)| *province == short)
        .map(|(_, capital)| *capital)
}

/// What to look `name` up as: itself, and for a Chinese one its capital, its name without its kind, or
/// with "市" (a short name alone often finds a village first).
fn queries(name: &str) -> Vec<String> {
    let mut queries = vec![name.to_owned()];
    if name.chars().count() < 2 || !is_cjk(name) {
        return queries;
    }
    let base = base_name(name);
    if let Some(capital) = capital(name).filter(|capital| *capital != base) {
        queries.push(capital.to_owned());
    }
    if base != name {
        queries.push(base.to_owned());
    } else if !name.ends_with('州') {
        queries.insert(0, format!("{name}市"));
    }
    queries
}

/// The places Open-Meteo's search gave, each with how many live there. Airports, stations and the like
/// are no place to have weather for.
fn candidates(reply: &Value) -> Vec<(Place, u64)> {
    let skipped = ["AIR", "RSTN", "BUS", "PRT", "HTL", "SCH", "HSP"];
    reply["results"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let kind = item["feature_code"].as_str().unwrap_or_default();
            if skipped.iter().any(|prefix| kind.starts_with(prefix)) {
                return None;
            }
            let label = item["name"].as_str()?.trim().to_owned();
            let mut areas: Vec<&str> = Vec::new();
            for key in ["admin2", "admin1", "country"] {
                if let Some(area) = item[key]
                    .as_str()
                    .filter(|area| !area.is_empty() && *area != label)
                    && !areas.contains(&area)
                {
                    areas.push(area);
                }
            }
            let place = Place {
                label,
                region: areas.join(" · "),
                lat: item["latitude"].as_f64()?,
                lon: item["longitude"].as_f64()?,
            }
            .tidy();
            place
                .valid()
                .then(|| (place, item["population"].as_u64().unwrap_or(0)))
        })
        .collect()
}

/// Those named as asked first, then the larger; of two of a name in almost one spot, one.
fn rank(name: &str, mut found: Vec<(Place, u64)>) -> Vec<Place> {
    let base = base_name(name);
    let exact = |place: &Place| {
        place.label == name || place.label == base || base_name(&place.label) == base
    };
    found.sort_by(|(a, people_a), (b, people_b)| {
        exact(b).cmp(&exact(a)).then(people_b.cmp(people_a))
    });
    let mut ranked: Vec<Place> = Vec::new();
    for (place, _) in found {
        let twice = ranked.iter().any(|other| {
            other.label == place.label
                && (other.lat - place.lat).abs() < 0.05
                && (other.lon - place.lon).abs() < 0.05
        });
        if !twice {
            ranked.push(place);
        }
    }
    ranked.truncate(FOUND);
    ranked
}

/// The places called `name`, named in `lang`.
fn search_places(name: &str, lang: &str) -> Result<Vec<Place>, Failure> {
    let mut found = Vec::new();
    let mut failure = None;
    for query in queries(name) {
        let reply = get(
            SEARCH,
            &[
                ("name", query),
                ("count", "10".into()),
                ("language", lang.into()),
                ("format", "json".into()),
            ],
        );
        match reply {
            Ok(reply) => found.extend(candidates(&reply)),
            Err(err) => failure = Some(err),
        }
    }
    match failure {
        Some(failure) if found.is_empty() => Err(failure),
        _ => Ok(rank(name, found)),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn reads_a_forecast() {
        let reply = json!({
            "utc_offset_seconds": 28800,
            "current": {"temperature_2m": 9.4, "relative_humidity_2m": 81, "apparent_temperature": 7.1,
                "is_day": 0, "weather_code": 61, "wind_speed_10m": 12.3},
            "daily": {
                "time": ["2026-11-13", "2026-11-14"],
                "weather_code": [61, 3],
                "temperature_2m_max": [12.0, 14.5],
                "temperature_2m_min": [6.0, 7.5],
                "precipitation_probability_max": [80, null],
                "sunrise": ["2026-11-13T06:20", "2026-11-14T06:21"],
                "sunset": ["2026-11-13T17:02", "2026-11-14T17:01"],
            },
        });
        let report = parse(&reply).unwrap();
        assert_eq!(report.temp, 9.4);
        assert_eq!(report.humidity, Some(81));
        assert!(!report.day);
        assert_eq!(report.code, 61);
        assert_eq!(report.days.len(), 2);
        assert_eq!(report.days[0].rain, 80);
        assert_eq!(report.days[1].rain, 0);
        assert_eq!(report.days[1].high, 14.5);
        // 06:20 there is 22:20 the day before in UTC.
        assert_eq!(report.sunrise_ms, Some(1_794_522_000_000));
        assert_eq!(
            report.sunset_ms.unwrap() - report.sunrise_ms.unwrap(),
            (10 * 60 + 42) * 60 * 1000
        );
    }

    #[test]
    fn a_reply_without_the_temperature_or_any_day_is_no_report() {
        assert!(parse(&json!({"current": {}, "daily": {"time": ["2026-11-13"]}})).is_none());
        assert!(
            parse(&json!({"current": {"temperature_2m": 1.0}, "daily": {"time": []}})).is_none()
        );
    }

    #[test]
    fn a_chinese_place_is_looked_up_the_ways_the_map_has_it() {
        assert_eq!(queries("Paris"), ["Paris"]);
        assert_eq!(queries("广州市"), ["广州市", "广州"]);
        assert_eq!(queries("杭州"), ["杭州"]);
        assert_eq!(queries("武汉"), ["武汉市", "武汉"]);
        assert_eq!(queries("新疆"), ["新疆市", "新疆", "乌鲁木齐"]);
        assert_eq!(queries("广东省"), ["广东省", "广州", "广东"]);
        assert_eq!(base_name("津市"), "津市");
        assert_eq!(capital("新疆维吾尔自治区"), Some("乌鲁木齐"));
    }

    #[test]
    fn places_named_as_asked_come_first_then_the_larger() {
        let reply = json!({"results": [
            {"name": "Springfield", "latitude": 39.8, "longitude": -89.6, "population": 110_000,
                "admin1": "Illinois", "country": "United States"},
            {"name": "Springfield Airport", "feature_code": "AIRP", "latitude": 39.84, "longitude": -89.67},
            {"name": "Springfield", "latitude": 37.2, "longitude": -93.3, "population": 170_000,
                "admin1": "Missouri", "country": "United States"},
            {"name": "Springfield", "latitude": 37.21, "longitude": -93.31, "population": 5},
            {"name": "West Springfield", "latitude": 42.1, "longitude": -72.6, "population": 900_000},
        ]});
        let ranked = rank("Springfield", candidates(&reply));
        let named: Vec<(&str, &str)> = ranked
            .iter()
            .map(|place| (place.label.as_str(), place.region.as_str()))
            .collect();
        assert_eq!(
            named,
            [
                ("Springfield", "Missouri · United States"),
                ("Springfield", "Illinois · United States"),
                ("West Springfield", ""),
            ]
        );
    }

    #[test]
    fn a_place_off_the_map_or_without_a_name_is_not_kept() {
        let place = |label: &str, lat: f64| Place {
            label: label.into(),
            lat,
            ..Place::default()
        };
        assert!(place("Oslo", 59.9).valid());
        assert!(!place(" ", 59.9).valid());
        assert!(!place("Oslo", 99.0).valid());
        assert!(!place("Oslo", f64::NAN).valid());
        assert_eq!(place("  New\n York\u{7} ", 1.0).tidy().label, "New York");
        assert_eq!(language("zh_CN.UTF-8"), "zh");
        assert_eq!(language("C"), "en");
    }
}
