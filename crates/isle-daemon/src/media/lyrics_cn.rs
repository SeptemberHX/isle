// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian
//
// Which services are asked, and how a result is held to the song playing, follows Daozai's lyrics.rs
// (https://github.com/Renly1994/xiaotang-daozai), MIT, Copyright (c) 2026 小唐的Token and Daozai contributors.

//! Synced lyrics from NetEase Cloud Music and QQ Music, for the songs LRCLIB has none for: mostly Chinese
//! ones. Each is searched by title and artist (which is all they are told), and a result counts only when
//! it is that song: the same title, the same artists, about the same length. Neither needs an account.

use std::time::Duration;

use isle_core::lrc::{self, LyricLine};
use isle_core::track::search_terms;
use log::debug;
use serde_json::Value;

const NETEASE: &str = "https://music.163.com";
const QQ: &str = "https://c.y.qq.com";
const TIMEOUT: Duration = Duration::from_secs(6);
const USER_AGENT: &str = concat!(
    "Isle/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/zickrian/isle)"
);
/// Of the songs that fit, the lyrics of this many are asked for at most.
const TRIED: usize = 3;
/// A result's length may differ from the track's by this share of it, or this many seconds if that is more.
const LENGTH_SHARE: f64 = 0.03;
const LENGTH_SLACK_S: f64 = 10.0;

/// A service did not answer (or not as it does): what it has is not known, which is not "nothing".
#[derive(Debug, PartialEq)]
pub struct Unanswered;

/// What a service has of a song's synced lyrics.
type Asked = Result<Option<Vec<LyricLine>>, Unanswered>;

/// The song's synced lyrics from NetEase, else QQ Music; `Ok(None)` when both answered and neither has
/// them, [`Unanswered`] when neither gave them and one of the two did not answer. `title` and `artist` are
/// as cleaned for a search. Blocking.
pub fn synced(title: &str, artist: &str, length_s: f64) -> Asked {
    if title.is_empty() || artist.is_empty() {
        return Ok(None);
    }
    let wanted = Song::new(title, artist, length_s);
    let first = netease(&wanted, title, artist);
    if matches!(first, Ok(Some(_))) {
        return first;
    }
    match qq(&wanted, title, artist) {
        Ok(None) => first,
        second => second,
    }
}

/// Whether `text` has Chinese, Japanese or Korean in it: such a song is asked for here first.
pub fn has_cjk(text: &str) -> bool {
    text.chars().any(|c| {
        matches!(c, '\u{3040}'..='\u{30ff}' | '\u{3400}'..='\u{9fff}' | '\u{ac00}'..='\u{d7a3}')
    })
}

/// A song as it is compared: its title and artists without case, spaces or punctuation.
#[derive(Debug, PartialEq)]
struct Song {
    title: String,
    artists: Vec<String>,
    length_s: f64,
}

impl Song {
    /// `title` and `artist` are cleaned as for a search first, so "Song (Official Video)" by "A feat. B"
    /// is the song "Song" by A and B, whichever of the two fields names B.
    fn new(title: &str, artist: &str, length_s: f64) -> Self {
        let mut artists = artists(artist);
        // "Song (feat. Someone)": the guest is one of its artists, and no part of its name.
        let named = match featured(title) {
            Some((at, guest)) => {
                artists.extend(self::artists(guest));
                artists.sort();
                artists.dedup();
                title[..at].trim_end_matches([' ', '(', '[', '（'])
            }
            None => title,
        };
        let (clean, _) = search_terms(named, artist);
        Self {
            title: plain(&clean),
            artists,
            length_s,
        }
    }

    /// How far (seconds) `found` is from this song's length, if it is this song: the same title, artists
    /// in common with neither side naming one the other lacks (a player often names the lead alone), and
    /// about the same length.
    fn fit(&self, found: &Song) -> Option<f64> {
        if self.title.is_empty() || found.title != self.title {
            return None;
        }
        let within = |a: &[String], b: &[String]| a.iter().all(|artist| b.contains(artist));
        if self.artists.is_empty()
            || found.artists.is_empty()
            || !(within(&self.artists, &found.artists) || within(&found.artists, &self.artists))
        {
            return None;
        }
        if self.length_s <= 0.0 || found.length_s <= 0.0 {
            return Some(0.0);
        }
        let apart = (found.length_s - self.length_s).abs();
        (apart <= (self.length_s * LENGTH_SHARE).max(LENGTH_SLACK_S)).then_some(apart)
    }
}

/// `text` in lower case, its letters and digits only.
fn plain(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// The artists `text` names ("A / B", "A、B", "A feat. B", "A (Feat. B)"), each as [`plain`], in order and
/// once.
fn artists(text: &str) -> Vec<String> {
    // A guest in brackets is named as one without them: "A (feat. B)" is "A  feat. B ".
    let mut names = text
        .to_lowercase()
        .replace(['(', ')', '[', ']', '（', '）'], " ");
    for marker in [
        " featuring ",
        " feat. ",
        " feat ",
        " ft. ",
        " ft ",
        " x ",
        " with ",
    ] {
        names = names.replace(marker, "/");
    }
    let mut artists: Vec<String> = names
        .split(['/', '、', ',', '，', '&', ';', '；'])
        .map(plain)
        .filter(|name| !name.is_empty())
        .collect();
    artists.sort();
    artists.dedup();
    artists
}

/// Who a title says the song features ("Song (feat. B)", "Song ft. B"), if anyone, and where in the title
/// that starts.
fn featured(title: &str) -> Option<(usize, &str)> {
    let lower = title.to_lowercase();
    // Lower-casing can change a text's byte lengths outside ASCII: places then no longer agree.
    if lower.len() != title.len() {
        return None;
    }
    let (at, marker) = ["featuring ", "feat. ", "feat ", "ft. ", "ft "]
        .iter()
        .filter_map(|marker| {
            let at = lower.find(marker)?;
            // A word of its own: after a space or a bracket, not the end of "left ".
            let before = lower[..at].chars().next_back()?;
            matches!(before, ' ' | '(' | '[' | '（').then_some((at, marker))
        })
        .min_by_key(|(at, _)| *at)?;
    let rest = title.get(at + marker.len()..)?;
    let end = rest.find([')', ']', '）']).unwrap_or(rest.len());
    let guest = rest[..end].trim();
    (!guest.is_empty() && title.is_char_boundary(at)).then_some((at, guest))
}

/// The ones of `found` (each with its id) that are `wanted`, the closest in length first, [`TRIED`] at most.
fn fitting<T>(wanted: &Song, found: Vec<(T, Song)>) -> Vec<T> {
    let mut fits: Vec<(T, f64)> = found
        .into_iter()
        .filter_map(|(id, song)| wanted.fit(&song).map(|apart| (id, apart)))
        .collect();
    fits.sort_by(|a, b| a.1.total_cmp(&b.1));
    fits.into_iter().map(|(id, _)| id).take(TRIED).collect()
}

/// A GET of `url` with `query`, as JSON; `None` (and a line in the log) when it could not be read.
fn get(url: &str, referer: &str, query: &[(&str, &str)]) -> Result<Value, Unanswered> {
    crate::http::get(url, TIMEOUT)
        .header("User-Agent", USER_AGENT)
        .header("Referer", referer)
        .query_pairs(query.iter().copied())
        .call()
        .and_then(|mut reply| reply.body_mut().read_json())
        .map_err(|err| {
            debug!("could not read {url}: {err}");
            Unanswered
        })
}

/// The names in a list of `{name}` objects, as one artist field.
fn names(list: &Value) -> String {
    list.as_array()
        .into_iter()
        .flatten()
        .filter_map(|artist| artist["name"].as_str())
        .collect::<Vec<_>>()
        .join("/")
}

/// From NetEase: searched by "title artist", then by the title alone (a translated or a second artist's
/// name often spoils the first), the lyrics of the songs that fit asked for in turn.
fn netease(wanted: &Song, title: &str, artist: &str) -> Asked {
    for search in [format!("{title} {artist}"), title.to_owned()] {
        let reply = get(
            &format!("{NETEASE}/api/search/get/web"),
            NETEASE,
            &[("s", &search), ("type", "1"), ("limit", "30")],
        )?;
        if reply["code"].as_i64() != Some(200) {
            return Err(Unanswered);
        }
        let ids = fitting(wanted, netease_songs(&reply));
        for id in &ids {
            let id = id.to_string();
            let reply = get(
                &format!("{NETEASE}/api/song/lyric"),
                NETEASE,
                &[("id", &id), ("lv", "-1"), ("kv", "-1"), ("tv", "-1")],
            )?;
            let lines = reply["lrc"]["lyric"].as_str().and_then(sung);
            if lines.is_some() {
                return Ok(lines);
            }
        }
        if !ids.is_empty() {
            return Ok(None);
        }
    }
    Ok(None)
}

/// The songs a NetEase search gave, each with its id.
fn netease_songs(reply: &Value) -> Vec<(u64, Song)> {
    reply["result"]["songs"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|song| {
            let artists = song.get("artists").or_else(|| song.get("ar"))?;
            let length_ms = song.get("duration").or_else(|| song.get("dt"))?.as_f64()?;
            Some((
                song["id"].as_u64()?,
                Song::new(song["name"].as_str()?, &names(artists), length_ms / 1000.0),
            ))
        })
        .collect()
}

/// From QQ Music: searched by "title artist", the lyrics of the songs that fit asked for in turn.
fn qq(wanted: &Song, title: &str, artist: &str) -> Asked {
    let referer = "https://y.qq.com/";
    let reply = get(
        &format!("{QQ}/soso/fcgi-bin/client_search_cp"),
        referer,
        &[
            ("w", &format!("{title} {artist}")),
            ("format", "json"),
            ("p", "1"),
            ("n", "12"),
        ],
    )?;
    if reply["code"].as_i64() != Some(0) {
        return Err(Unanswered);
    }
    for mid in fitting(wanted, qq_songs(&reply)) {
        let reply = get(
            &format!("{QQ}/lyric/fcgi-bin/fcg_query_lyric_new.fcg"),
            referer,
            &[("songmid", &mid), ("format", "json"), ("nobase64", "1")],
        )?;
        let lines = reply["lyric"].as_str().and_then(sung);
        if lines.is_some() {
            return Ok(lines);
        }
    }
    Ok(None)
}

/// The songs a QQ Music search gave, each with its id (letters and digits only: it goes in a request).
fn qq_songs(reply: &Value) -> Vec<(String, Song)> {
    reply["data"]["song"]["list"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|song| {
            let mid = song["songmid"].as_str()?;
            if mid.is_empty() || !mid.bytes().all(|b| b.is_ascii_alphanumeric()) {
                return None;
            }
            Some((
                mid.to_owned(),
                Song::new(
                    song["songname"].as_str()?,
                    &names(&song["singer"]),
                    song["interval"].as_f64().unwrap_or(0.0),
                ),
            ))
        })
        .collect()
}

/// A line that says who wrote or played what ("作词 : 周杰伦"), not one that is sung.
fn is_credit(text: &str) -> bool {
    const ROLES: [&str; 26] = [
        "作词",
        "作曲",
        "编曲",
        "词",
        "曲",
        "演唱",
        "原唱",
        "制作人",
        "监制",
        "混音",
        "母带",
        "和声",
        "吉他",
        "贝斯",
        "鼓",
        "弦乐",
        "录音",
        "出品",
        "发行",
        "op",
        "sp",
        "lyrics",
        "lyricist",
        "composer",
        "arranger",
        "producer",
    ];
    let lower = text.trim().to_lowercase();
    let Some((role, _)) = lower.split_once([':', '：']) else {
        return false;
    };
    ROLES.contains(&role.trim())
}

/// The lines of LRC `text`, if the song itself has times: some services time the credits alone, and the
/// island would then sit on "作曲 : …" for the whole song.
fn sung(text: &str) -> Option<Vec<LyricLine>> {
    // NetEase's own credits come as JSON lines: no lyrics.
    let text: String = text
        .lines()
        .filter(|line| !line.trim_start().starts_with("{\""))
        .collect::<Vec<_>>()
        .join("\n");
    let lines = lrc::parse(&text);
    lines
        .iter()
        .any(|line| !line.text.trim().is_empty() && !is_credit(&line.text))
        .then_some(lines)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_result_is_the_song_only_with_its_title_artists_and_length() {
        let wanted = Song::new("晴天", "周杰伦", 269.0);
        let found =
            |title: &str, artist: &str, length: f64| wanted.fit(&Song::new(title, artist, length));
        assert_eq!(found("晴天", "周杰伦", 270.7), Some(270.7 - 269.0));
        // Another's cover, a version of its own, another length.
        assert_eq!(found("晴天", "RyaVocal", 270.0), None);
        assert_eq!(found("晴天 (原唱 周杰伦)", "周杰伦", 270.0), None);
        assert_eq!(found("晴天", "周杰伦", 112.0), None);
        // A player names the lead alone; the service all of them, and the other way round.
        let duet = Song::new("Song", "A", 200.0);
        assert!(duet.fit(&Song::new("Song", "A/B", 200.0)).is_some());
        assert!(
            Song::new("Song", "A & B", 200.0)
                .fit(&Song::new("song", "a", 200.0))
                .is_some()
        );
        assert!(
            Song::new("Song", "A & B", 200.0)
                .fit(&Song::new("Song", "A/C", 200.0))
                .is_none()
        );
        // No length known: the names decide.
        assert_eq!(
            Song::new("Song", "A", 0.0).fit(&Song::new("Song", "A", 200.0)),
            Some(0.0)
        );
    }

    #[test]
    fn a_guest_is_an_artist_wherever_named() {
        // As Edge names a song playing on a web page: the guest in brackets after the lead.
        assert_eq!(
            Song::new("你若成风", "许嵩 (Feat. 莫诗旎)", 220.0).fit(&Song::new(
                "你若成风",
                "许嵩/莫诗旎",
                221.5
            )),
            Some(1.5)
        );
        assert_eq!(
            Song::new("Song (feat. B)", "A", 1.0),
            Song::new("Song", "A feat. B", 1.0)
        );
        assert_eq!(Song::new("Song ft. B", "A", 1.0).artists, ["a", "b"]);
        assert_eq!(featured("Left Behind"), None);
        assert_eq!(featured("Song [ft. B] live"), Some((6, "B")));
        assert_eq!(artists("周杰伦、费玉清"), ["周杰伦", "费玉清"]);
        assert_eq!(artists("A, B & A"), ["a", "b"]);
    }

    #[test]
    fn the_closest_in_length_come_first_a_few_at_most() {
        let wanted = Song::new("Song", "A", 200.0);
        let found = [205.0, 200.5, 300.0, 203.0, 201.0]
            .into_iter()
            .enumerate()
            .map(|(id, length)| (id, Song::new("Song", "A", length)))
            .collect();
        assert_eq!(fitting(&wanted, found), [1, 4, 3]);
    }

    #[test]
    fn search_results_are_read_as_songs() {
        let reply = json!({"result": {"songs": [
            {"id": 186016, "name": "晴天", "artists": [{"name": "周杰伦"}], "duration": 269000},
            {"id": 2, "name": "No artists", "duration": 1000},
        ]}});
        assert_eq!(
            netease_songs(&reply),
            [(186016, Song::new("晴天", "周杰伦", 269.0))]
        );
        let reply = json!({"data": {"song": {"list": [
            {"songmid": "0039MnYb0qxYhV", "songname": "晴天", "singer": [{"name": "周杰伦"}], "interval": 269},
            {"songmid": "a/b", "songname": "x", "singer": [{"name": "y"}], "interval": 1},
        ]}}});
        assert_eq!(
            qq_songs(&reply),
            [(
                "0039MnYb0qxYhV".to_owned(),
                Song::new("晴天", "周杰伦", 269.0)
            )]
        );
    }

    #[test]
    fn lyrics_with_only_their_credits_timed_are_not_synced() {
        assert!(sung("[00:00.00] 作词 : 周杰伦\n[00:01.00] 作曲 : 周杰伦\n故事的小黄花").is_none());
        let lines = sung("{\"t\":0,\"c\":[{\"tx\":\"作词: \"}]}\n[00:00.00] 作词 : 周杰伦\n[00:29.50]故事的小黄花").unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1].time_ms, 29_500);
        assert!(is_credit("Composer: Someone") && !is_credit("Baby: don't go"));
    }

    #[test]
    fn chinese_japanese_and_korean_are_told_from_the_rest() {
        assert!(has_cjk("晴天") && has_cjk("ありがとう") && has_cjk("봄날"));
        assert!(!has_cjk("Clair de Lune – Débussy"));
    }
}
