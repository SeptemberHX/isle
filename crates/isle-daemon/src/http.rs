// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

//! One HTTP agent for every request isled makes, so they share its connections and TLS setup.

use std::sync::{LazyLock, Mutex, PoisonError};
use std::time::{Duration, Instant};

use ureq::typestate::WithoutBody;
use ureq::{Agent, RequestBuilder};

static AGENT: LazyLock<Agent> = LazyLock::new(|| Agent::config_builder().build().into());

/// A GET of `url` that gives up after `timeout` in all. Blocking once called.
pub fn get(url: &str, timeout: Duration) -> RequestBuilder<WithoutBody> {
    AGENT
        .get(url)
        .config()
        .timeout_global(Some(timeout))
        .build()
}

/// GNOME's own proxy (Settings → Network → Proxy, set by hand) as last read, and when; read again after
/// [`PROXY_FOR`].
static DESKTOP_PROXY: Mutex<Option<(Option<ureq::Proxy>, Instant)>> = Mutex::new(None);
const PROXY_FOR: Duration = Duration::from_secs(60);

/// As [`get`], through the desktop's proxy when the login has none of its own (`https_proxy`, which the
/// agent follows by itself) and GNOME has one set by hand: isled, started by systemd, is told of neither
/// otherwise, and a server far away is then out of reach where the desktop's own apps reach it. Blocking,
/// the first call in a while a little longer (it asks `gsettings`).
pub fn get_through_desktop_proxy(url: &str, timeout: Duration) -> RequestBuilder<WithoutBody> {
    let request = AGENT.get(url).config().timeout_global(Some(timeout));
    match desktop_proxy() {
        Some(proxy) => request.proxy(Some(proxy)).build(),
        None => request.build(),
    }
}

/// Whether [`get_through_desktop_proxy`] goes another way than [`get`] now.
pub fn has_desktop_proxy() -> bool {
    desktop_proxy().is_some()
}

/// GNOME's proxy for HTTPS (else for HTTP), unless the login's environment names one already.
fn desktop_proxy() -> Option<ureq::Proxy> {
    const VARS: [&str; 4] = ["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"];
    if VARS
        .iter()
        .any(|var| std::env::var_os(var).is_some_and(|value| !value.is_empty()))
    {
        return None;
    }
    let mut known = DESKTOP_PROXY.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some((proxy, at)) = known.as_ref()
        && at.elapsed() < PROXY_FOR
    {
        return proxy.clone();
    }
    let setting = |schema: &str, key: &str| {
        let out = std::process::Command::new("gsettings")
            .args(["get", schema, key])
            .output()
            .ok()?;
        let value = String::from_utf8_lossy(&out.stdout);
        Some(value.trim().trim_matches('\'').to_owned())
    };
    let proxy = (setting("org.gnome.system.proxy", "mode").as_deref() == Some("manual"))
        .then(|| {
            ["https", "http"].into_iter().find_map(|kind| {
                let schema = format!("org.gnome.system.proxy.{kind}");
                let host = setting(&schema, "host").filter(|host| !host.is_empty())?;
                let port: u16 = setting(&schema, "port")?
                    .parse()
                    .ok()
                    .filter(|port| *port > 0)?;
                ureq::Proxy::new(&proxy_url(&host, port)).ok()
            })
        })
        .flatten();
    *known = Some((proxy.clone(), Instant::now()));
    proxy
}

/// An HTTP proxy's address; an IPv6 host in brackets.
fn proxy_url(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("http://[{host}]:{port}")
    } else {
        format!("http://{host}:{port}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_proxys_address_takes_a_name_or_either_kind_of_number() {
        assert_eq!(proxy_url("127.0.0.1", 7890), "http://127.0.0.1:7890");
        assert_eq!(proxy_url("proxy.lan", 3128), "http://proxy.lan:3128");
        assert_eq!(proxy_url("::1", 8080), "http://[::1]:8080");
    }
}
