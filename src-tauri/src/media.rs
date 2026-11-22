//! Now-playing information and playback control through the Windows
//! Global System Media Transport Controls (the same API that powers the media flyout
//! in Quick Settings). Works with Spotify, browsers, Media Player, and most players.

use std::sync::{mpsc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Manager};

pub const STATE_EVENT: &str = "media://state";

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub available: bool,
    pub app_id: String,
    pub app_name: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Album art as a data URL.
    pub artwork: Option<String>,
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    /// Unix time (ms) when `position_ms` was measured, for client-side extrapolation.
    pub position_updated_at: u64,
    pub playback_rate: f64,
    pub can_play_pause: bool,
    pub can_next: bool,
    pub can_previous: bool,
    pub can_seek: bool,
    pub shuffle: Option<bool>,
    /// "none" | "track" | "list"
    pub repeat: Option<String>,
}

pub enum MediaCommand {
    PlayPause,
    Next,
    Previous,
    Seek(u64),
    ToggleShuffle,
    CycleRepeat,
    Refresh,
}

pub struct MediaControl {
    tx: Mutex<Option<mpsc::Sender<MediaCommand>>>,
    latest: Mutex<MediaState>,
}

impl Default for MediaControl {
    fn default() -> Self {
        Self {
            tx: Mutex::new(None),
            latest: Mutex::new(MediaState::default()),
        }
    }
}

impl MediaControl {
    fn send(&self, cmd: MediaCommand) -> Result<(), String> {
        self.tx
            .lock()
            .unwrap()
            .as_ref()
            .ok_or("media controls are not available")?
            .send(cmd)
            .map_err(|e| e.to_string())
    }
}

pub fn start(app: &AppHandle) {
    let (tx, rx) = mpsc::channel();
    *app.state::<MediaControl>().tx.lock().unwrap() = Some(tx.clone());
    let handle = app.clone();
    std::thread::Builder::new()
        .name("peek-media".into())
        .spawn(move || {
            #[cfg(windows)]
            win::run(handle, tx, rx);
            #[cfg(not(windows))]
            {
                let _ = (handle, tx);
                while rx.recv().is_ok() {}
            }
        })
        .ok();
}

fn publish(app: &AppHandle, state: MediaState) {
    use tauri::Emitter;
    let control = app.state::<MediaControl>();
    let mut latest = control.latest.lock().unwrap();
    if *latest != state {
        *latest = state.clone();
        drop(latest);
        if let Some(win) = crate::island::window(app) {
            let _ = win.emit(STATE_EVENT, state);
        }
    }
}

/// Friendly name for an App User Model ID.
pub fn app_display_name(aumid: &str) -> String {
    let lower = aumid.to_lowercase();
    let known = [
        ("spotify", "Spotify"),
        ("308046b0af4a39cb", "Firefox"),
        ("firefox", "Firefox"),
        ("msedge", "Microsoft Edge"),
        ("chrome", "Google Chrome"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("vivaldi", "Vivaldi"),
        ("zunemusic", "Media Player"),
        ("zunevideo", "Movies & TV"),
        ("applemusic", "Apple Music"),
        ("itunes", "iTunes"),
        ("tidal", "TIDAL"),
        ("deezer", "Deezer"),
        ("amazonmusic", "Amazon Music"),
        ("vlc", "VLC"),
        ("foobar2000", "foobar2000"),
        ("musicbee", "MusicBee"),
        ("aimp", "AIMP"),
        ("discord", "Discord"),
        ("youtube", "YouTube Music"),
        ("plex", "Plex"),
    ];
    for (needle, name) in known {
        if lower.contains(needle) {
            return name.to_string();
        }
    }
    let base = aumid.rsplit(['\\', '/']).next().unwrap_or(aumid);
    let base = base.split('!').next_back().unwrap_or(base);
    let base = base.trim_end_matches(".exe").trim_end_matches(".EXE");
    let base = base.split('_').next().unwrap_or(base);
    let base = base.rsplit('.').next().unwrap_or(base);
    if base.is_empty() {
        "Media".into()
    } else {
        base.to_string()
    }
}

#[tauri::command]
pub fn media_state(control: tauri::State<'_, MediaControl>) -> MediaState {
    control.latest.lock().unwrap().clone()
}

#[tauri::command]
pub fn media_command(
    control: tauri::State<'_, MediaControl>,
    action: String,
    position_ms: Option<u64>,
) -> Result<(), String> {
    let cmd = match action.as_str() {
        "playPause" => MediaCommand::PlayPause,
        "next" => MediaCommand::Next,
        "previous" => MediaCommand::Previous,
        "seek" => MediaCommand::Seek(position_ms.unwrap_or(0)),
        "shuffle" => MediaCommand::ToggleShuffle,
        "repeat" => MediaCommand::CycleRepeat,
        "refresh" => MediaCommand::Refresh,
        other => return Err(format!("unknown media action: {other}")),
    };
    control.send(cmd)
}

#[cfg(windows)]
mod win {
    use std::{
        sync::mpsc::{self, RecvTimeoutError},
        time::Duration,
    };

    use base64::Engine;
    use tauri::AppHandle;
    use windows::{
        Foundation::TypedEventHandler,
        Media::{
            Control::{
                GlobalSystemMediaTransportControlsSession as Session,
                GlobalSystemMediaTransportControlsSessionManager as Manager,
                GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
            },
            MediaPlaybackAutoRepeatMode as Repeat,
        },
        Storage::Streams::DataReader,
    };

    use super::{app_display_name, publish, MediaCommand, MediaState};
    use crate::hardware::now_ms;

    /// Ticks (100 ns) between 1601-01-01 and 1970-01-01.
    const EPOCH_DIFF: i64 = 116_444_736_000_000_000;

    struct Tracked {
        session: Session,
        tokens: [i64; 3],
    }

    impl Drop for Tracked {
        fn drop(&mut self) {
            let _ = self.session.RemoveMediaPropertiesChanged(self.tokens[0]);
            let _ = self.session.RemovePlaybackInfoChanged(self.tokens[1]);
            let _ = self.session.RemoveTimelinePropertiesChanged(self.tokens[2]);
        }
    }

    #[derive(Default)]
    struct ArtCache {
        key: String,
        data: Option<String>,
        attempts: u8,
    }

    pub fn run(app: AppHandle, tx: mpsc::Sender<MediaCommand>, rx: mpsc::Receiver<MediaCommand>) {
        let manager = loop {
            match Manager::RequestAsync().and_then(|op| op.join()) {
                Ok(m) => break m,
                Err(e) => {
                    log::warn!("media session manager unavailable: {e}");
                    std::thread::sleep(Duration::from_secs(10));
                }
            }
        };

        {
            let tx = tx.clone();
            let _ = manager.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
                let _ = tx.send(MediaCommand::Refresh);
                Ok(())
            }));
        }
        {
            let tx = tx.clone();
            let _ = manager.SessionsChanged(&TypedEventHandler::new(move |_, _| {
                let _ = tx.send(MediaCommand::Refresh);
                Ok(())
            }));
        }

        let mut tracked: Option<Tracked> = None;
        let mut art = ArtCache::default();

        loop {
            let session = manager.GetCurrentSession().ok();
            let same = match (&tracked, &session) {
                (Some(t), Some(s)) => t.session == *s,
                (None, None) => true,
                _ => false,
            };
            if !same {
                tracked = session.as_ref().and_then(|s| track(s, &tx));
            }

            let state = match &session {
                Some(s) => read_state(s, &mut art).unwrap_or_default(),
                None => MediaState::default(),
            };
            publish(&app, state);

            // Wait for an event or a command; poll every couple of seconds as a fallback
            // because some players do not raise change events reliably.
            match rx.recv_timeout(Duration::from_millis(2000)) {
                Ok(cmd) => {
                    if let Some(s) = &session {
                        if let Err(e) = execute(s, cmd) {
                            log::debug!("media command failed: {e}");
                        }
                    }
                    // Coalesce bursts of events.
                    std::thread::sleep(Duration::from_millis(60));
                    while rx.try_recv().is_ok() {}
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    fn track(session: &Session, tx: &mpsc::Sender<MediaCommand>) -> Option<Tracked> {
        let make = || {
            let tx = tx.clone();
            move || {
                let _ = tx.send(MediaCommand::Refresh);
            }
        };
        let f1 = make();
        let f2 = make();
        let f3 = make();
        let t1 = session
            .MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                f1();
                Ok(())
            }))
            .ok()?;
        let t2 = session
            .PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                f2();
                Ok(())
            }))
            .ok()?;
        let t3 = session
            .TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
                f3();
                Ok(())
            }))
            .ok()?;
        Some(Tracked {
            session: session.clone(),
            tokens: [t1, t2, t3],
        })
    }

    fn read_state(session: &Session, art: &mut ArtCache) -> windows::core::Result<MediaState> {
        let app_id = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let props = session.TryGetMediaPropertiesAsync()?.join()?;
        let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
        let artist = props
            .Artist()
            .map(|s| s.to_string())
            .ok()
            .filter(|s| !s.is_empty())
            .or_else(|| props.AlbumArtist().map(|s| s.to_string()).ok())
            .unwrap_or_default();
        let album = props
            .AlbumTitle()
            .map(|s| s.to_string())
            .unwrap_or_default();

        let info = session.GetPlaybackInfo()?;
        let status = info.PlaybackStatus()?;
        let controls = info.Controls()?;
        let timeline = session.GetTimelineProperties()?;

        let start = timeline.StartTime().map(|t| t.Duration).unwrap_or(0);
        let end = timeline.EndTime().map(|t| t.Duration).unwrap_or(0);
        let pos = timeline.Position().map(|t| t.Duration).unwrap_or(0);
        let updated = timeline
            .LastUpdatedTime()
            .map(|d| d.UniversalTime)
            .unwrap_or(0);
        let updated_ms = if updated > EPOCH_DIFF {
            ((updated - EPOCH_DIFF) / 10_000) as u64
        } else {
            now_ms()
        };

        // Album art: only re-read when the track changes. Some players publish the
        // thumbnail a moment after the title, so retry a few times while it is missing.
        let key = format!("{app_id}\u{1}{title}\u{1}{artist}\u{1}{album}");
        if art.key != key {
            art.key = key;
            art.data = None;
            art.attempts = 0;
        }
        if art.data.is_none() && art.attempts < 4 {
            art.attempts += 1;
            art.data = props
                .Thumbnail()
                .ok()
                .and_then(|t| read_thumbnail(&t).ok().flatten());
        }

        let shuffle = info.IsShuffleActive().ok().and_then(|v| v.Value().ok());
        let repeat = info
            .AutoRepeatMode()
            .ok()
            .and_then(|v| v.Value().ok())
            .map(|m| {
                match m {
                    Repeat::Track => "track",
                    Repeat::List => "list",
                    _ => "none",
                }
                .to_string()
            });

        Ok(MediaState {
            available: true,
            app_name: app_display_name(&app_id),
            app_id,
            title,
            artist,
            album,
            artwork: art.data.clone(),
            playing: status == Status::Playing,
            position_ms: ((pos - start).max(0) / 10_000) as u64,
            duration_ms: ((end - start).max(0) / 10_000) as u64,
            position_updated_at: updated_ms.min(now_ms()),
            playback_rate: info
                .PlaybackRate()
                .ok()
                .and_then(|r| r.Value().ok())
                .unwrap_or(1.0),
            can_play_pause: controls.IsPlayPauseToggleEnabled().unwrap_or(false)
                || controls.IsPlayEnabled().unwrap_or(false)
                || controls.IsPauseEnabled().unwrap_or(false),
            can_next: controls.IsNextEnabled().unwrap_or(false),
            can_previous: controls.IsPreviousEnabled().unwrap_or(false),
            can_seek: controls.IsPlaybackPositionEnabled().unwrap_or(false) && end > 0,
            shuffle: shuffle.filter(|_| controls.IsShuffleEnabled().unwrap_or(false)),
            repeat: repeat.filter(|_| controls.IsRepeatEnabled().unwrap_or(false)),
        })
    }

    fn read_thumbnail(
        thumb: &windows::Storage::Streams::IRandomAccessStreamReference,
    ) -> windows::core::Result<Option<String>> {
        let stream = thumb.OpenReadAsync()?.join()?;
        let size = stream.Size()? as u32;
        if size == 0 || size > 8 * 1024 * 1024 {
            return Ok(None);
        }
        let reader = DataReader::CreateDataReader(&stream)?;
        reader.LoadAsync(size)?.join()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf)?;
        let mut mime = stream
            .ContentType()
            .map(|s| s.to_string())
            .unwrap_or_default();
        if !mime.starts_with("image/") {
            mime = sniff_mime(&buf).to_string();
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        Ok(Some(format!("data:{mime};base64,{b64}")))
    }

    fn sniff_mime(buf: &[u8]) -> &'static str {
        match buf {
            [0x89, b'P', b'N', b'G', ..] => "image/png",
            [0xFF, 0xD8, ..] => "image/jpeg",
            [b'G', b'I', b'F', ..] => "image/gif",
            [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "image/webp",
            [b'B', b'M', ..] => "image/bmp",
            _ => "image/jpeg",
        }
    }

    fn execute(session: &Session, cmd: MediaCommand) -> windows::core::Result<()> {
        match cmd {
            MediaCommand::PlayPause => {
                session.TryTogglePlayPauseAsync()?.join()?;
            }
            MediaCommand::Next => {
                session.TrySkipNextAsync()?.join()?;
            }
            MediaCommand::Previous => {
                session.TrySkipPreviousAsync()?.join()?;
            }
            MediaCommand::Seek(ms) => {
                let start = session
                    .GetTimelineProperties()
                    .and_then(|t| t.StartTime())
                    .map(|t| t.Duration)
                    .unwrap_or(0);
                session
                    .TryChangePlaybackPositionAsync(start + ms as i64 * 10_000)?
                    .join()?;
            }
            MediaCommand::ToggleShuffle => {
                let info = session.GetPlaybackInfo()?;
                let current = info
                    .IsShuffleActive()
                    .ok()
                    .and_then(|v| v.Value().ok())
                    .unwrap_or(false);
                session.TryChangeShuffleActiveAsync(!current)?.join()?;
            }
            MediaCommand::CycleRepeat => {
                let info = session.GetPlaybackInfo()?;
                let current = info
                    .AutoRepeatMode()
                    .ok()
                    .and_then(|v| v.Value().ok())
                    .unwrap_or(Repeat::None);
                let next = match current {
                    Repeat::None => Repeat::List,
                    Repeat::List => Repeat::Track,
                    _ => Repeat::None,
                };
                session.TryChangeAutoRepeatModeAsync(next)?.join()?;
            }
            MediaCommand::Refresh => {}
        }
        Ok(())
    }
}
