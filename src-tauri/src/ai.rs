//! AI chat with streaming responses, model discovery, web-result grounding and
//! "search the web" in the default browser.
//!
//! Supported provider protocols:
//! - Ollama (`/api/chat`, NDJSON stream) for local models
//! - OpenAI-compatible (`/chat/completions`, SSE): OpenAI, LM Studio, llama.cpp,
//!   OpenRouter, Groq, Jan, LocalAI, vLLM, ...
//! - Anthropic Messages API (SSE)
//! - Google Gemini (`streamGenerateContent`, SSE)

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::{
    secrets,
    settings::{AiProvider, ProviderKind, Settings, SettingsStore},
};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub request_id: String,
    pub provider_id: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub use_web: bool,
    /// Local date and time, formatted by the UI, so answers know "today".
    pub local_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatEvent {
    Status { message: String },
    Sources { sources: Vec<Source> },
    Delta { text: String },
    Done,
    Error { message: String },
}

pub struct AiState {
    client: reqwest::Client,
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Default for AiState {
    fn default() -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .user_agent(concat!("Peek/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("failed to build HTTP client");
        Self {
            client,
            cancels: Mutex::new(HashMap::new()),
        }
    }
}

impl AiState {
    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }
}

fn secret_name(provider: &AiProvider) -> String {
    format!("ai:{}", provider.id)
}

fn base(provider: &AiProvider) -> String {
    provider.base_url.trim().trim_end_matches('/').to_string()
}

/// Turn transport errors into something a person can act on.
fn describe_error(provider: &AiProvider, e: &reqwest::Error) -> String {
    if e.is_connect() {
        if provider.local {
            format!(
                "Couldn't reach {} at {}. Make sure it's running, or pick another provider in Settings → AI.",
                provider.name,
                base(provider)
            )
        } else {
            format!(
                "Couldn't connect to {}. Check your internet connection.",
                provider.name
            )
        }
    } else if e.is_timeout() {
        format!("{} took too long to respond.", provider.name)
    } else {
        e.to_string()
    }
}

async fn error_from_response(provider: &AiProvider, resp: reqwest::Response) -> String {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .or_else(|| v.get("error").filter(|e| e.is_string()))
                .or_else(|| v.get("message"))
                .or_else(|| v.pointer("/0/error/message"))
                .and_then(|m| m.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(300).collect());
    match status.as_u16() {
        401 | 403 => format!(
            "{} rejected the API key ({}). {}",
            provider.name, status, detail
        ),
        404 => format!(
            "{} returned 404. Check the base URL and model name. {}",
            provider.name, detail
        ),
        429 => format!("{} is rate limiting requests. {}", provider.name, detail),
        _ => format!("{} returned {}. {}", provider.name, status, detail),
    }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    request: ChatRequest,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let settings = app.state::<SettingsStore>().get();
    let state = app.state::<AiState>();
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .cancels
        .lock()
        .unwrap()
        .insert(request.request_id.clone(), cancel.clone());

    let result = run_chat(&settings, state.client(), &request, &on_event, &cancel).await;
    state.cancels.lock().unwrap().remove(&request.request_id);

    match result {
        Ok(()) => {
            let _ = on_event.send(ChatEvent::Done);
        }
        Err(message) => {
            if cancel.load(Ordering::SeqCst) {
                let _ = on_event.send(ChatEvent::Done);
            } else {
                let _ = on_event.send(ChatEvent::Error { message });
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn ai_cancel(state: tauri::State<'_, AiState>, request_id: String) {
    if let Some(flag) = state.cancels.lock().unwrap().get(&request_id) {
        flag.store(true, Ordering::SeqCst);
    }
}

async fn run_chat(
    settings: &Settings,
    client: &reqwest::Client,
    request: &ChatRequest,
    events: &Channel<ChatEvent>,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let provider = settings
        .provider(request.provider_id.as_deref())
        .ok_or("No AI provider is configured. Open Settings → AI.")?;
    if provider.model.trim().is_empty() {
        return Err(format!(
            "No model selected for {}. Pick one in Settings → AI.",
            provider.name
        ));
    }
    let key = if provider.needs_key {
        Some(
            secrets::get(&secret_name(&provider))
                .ok_or_else(|| format!("Add your {} API key in Settings → AI.", provider.name))?,
        )
    } else {
        secrets::get(&secret_name(&provider))
    };

    let mut system = settings.ai_system_prompt.trim().to_string();
    if let Some(t) = &request.local_time {
        system.push_str(&format!("\n\nThe user's local date and time is {t}."));
    }

    // Ground the answer in web results when asked to.
    if request.use_web && settings.grounding_provider != "none" {
        let query = request
            .messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default();
        let _ = events.send(ChatEvent::Status {
            message: "Searching the web…".into(),
        });
        match search_web(settings, client, &query).await {
            Ok(sources) if !sources.is_empty() => {
                let mut ctx = String::from(
                    "\n\nUse these web results to answer. Cite them inline as [1], [2], … and say so if they don't contain the answer.\n",
                );
                for (i, s) in sources.iter().enumerate() {
                    ctx.push_str(&format!(
                        "\n[{}] {}\n{}\n{}\n",
                        i + 1,
                        s.title,
                        s.url,
                        s.snippet
                    ));
                }
                system.push_str(&ctx);
                let _ = events.send(ChatEvent::Sources { sources });
            }
            Ok(_) => {}
            Err(e) => {
                let _ = events.send(ChatEvent::Status {
                    message: format!("Web search failed: {e}"),
                });
            }
        }
    }

    let _ = events.send(ChatEvent::Status {
        message: String::new(),
    });

    let emit = |text: &str| {
        if !text.is_empty() {
            let _ = events.send(ChatEvent::Delta {
                text: text.to_string(),
            });
        }
    };

    match provider.kind {
        ProviderKind::Ollama => {
            let mut messages = vec![json!({ "role": "system", "content": system })];
            messages.extend(
                request
                    .messages
                    .iter()
                    .map(|m| json!({ "role": m.role, "content": m.content })),
            );
            let resp = client
                .post(format!("{}/api/chat", base(&provider)))
                .json(&json!({ "model": provider.model, "messages": messages, "stream": true }))
                .send()
                .await
                .map_err(|e| describe_error(&provider, &e))?;
            if !resp.status().is_success() {
                return Err(error_from_response(&provider, resp).await);
            }
            stream_lines(resp, cancel, |line| {
                let v: Value = serde_json::from_str(line).ok()?;
                if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
                    return Some(Err(err.to_string()));
                }
                if let Some(t) = v.pointer("/message/content").and_then(|t| t.as_str()) {
                    emit(t);
                }
                None
            })
            .await
        }
        ProviderKind::Openai => {
            let mut messages = vec![json!({ "role": "system", "content": system })];
            messages.extend(
                request
                    .messages
                    .iter()
                    .map(|m| json!({ "role": m.role, "content": m.content })),
            );
            let mut req = client
                .post(format!("{}/chat/completions", base(&provider)))
                .json(&json!({ "model": provider.model, "messages": messages, "stream": true }));
            if let Some(k) = &key {
                req = req.bearer_auth(k);
            }
            if provider.base_url.contains("openrouter.ai") {
                req = req
                    .header("HTTP-Referer", "https://github.com/HighSkai/Peek")
                    .header("X-Title", "Peek");
            }
            let resp = req
                .send()
                .await
                .map_err(|e| describe_error(&provider, &e))?;
            if !resp.status().is_success() {
                return Err(error_from_response(&provider, resp).await);
            }
            stream_lines(resp, cancel, |line| {
                let data = line.strip_prefix("data:")?.trim();
                if data == "[DONE]" {
                    return Some(Ok(()));
                }
                let v: Value = serde_json::from_str(data).ok()?;
                if let Some(err) = v.pointer("/error/message").and_then(|e| e.as_str()) {
                    return Some(Err(err.to_string()));
                }
                if let Some(t) = v
                    .pointer("/choices/0/delta/content")
                    .and_then(|t| t.as_str())
                {
                    emit(t);
                }
                None
            })
            .await
        }
        ProviderKind::Anthropic => {
            // Anthropic requires alternating roles starting with "user".
            let messages: Vec<Value> = request
                .messages
                .iter()
                .filter(|m| m.role == "user" || m.role == "assistant")
                .map(|m| json!({ "role": m.role, "content": m.content }))
                .collect();
            let resp = client
                .post(format!("{}/messages", base(&provider)))
                .header("x-api-key", key.clone().unwrap_or_default())
                .header("anthropic-version", "2023-06-01")
                .json(&json!({
                    "model": provider.model,
                    "system": system,
                    "messages": messages,
                    "max_tokens": 4096,
                    "stream": true
                }))
                .send()
                .await
                .map_err(|e| describe_error(&provider, &e))?;
            if !resp.status().is_success() {
                return Err(error_from_response(&provider, resp).await);
            }
            stream_lines(resp, cancel, |line| {
                let data = line.strip_prefix("data:")?.trim();
                let v: Value = serde_json::from_str(data).ok()?;
                match v.get("type").and_then(|t| t.as_str()) {
                    Some("content_block_delta") => {
                        if let Some(t) = v.pointer("/delta/text").and_then(|t| t.as_str()) {
                            emit(t);
                        }
                        None
                    }
                    Some("message_stop") => Some(Ok(())),
                    Some("error") => Some(Err(v
                        .pointer("/error/message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Anthropic returned an error")
                        .to_string())),
                    _ => None,
                }
            })
            .await
        }
        ProviderKind::Gemini => {
            let contents: Vec<Value> = request
                .messages
                .iter()
                .map(|m| {
                    json!({
                        "role": if m.role == "assistant" { "model" } else { "user" },
                        "parts": [{ "text": m.content }]
                    })
                })
                .collect();
            let model = provider.model.trim_start_matches("models/");
            let resp = client
                .post(format!(
                    "{}/models/{}:streamGenerateContent?alt=sse",
                    base(&provider),
                    model
                ))
                .header("x-goog-api-key", key.clone().unwrap_or_default())
                .json(&json!({
                    "contents": contents,
                    "systemInstruction": { "parts": [{ "text": system }] }
                }))
                .send()
                .await
                .map_err(|e| describe_error(&provider, &e))?;
            if !resp.status().is_success() {
                return Err(error_from_response(&provider, resp).await);
            }
            stream_lines(resp, cancel, |line| {
                let data = line.strip_prefix("data:")?.trim();
                let v: Value = serde_json::from_str(data).ok()?;
                if let Some(err) = v.pointer("/error/message").and_then(|e| e.as_str()) {
                    return Some(Err(err.to_string()));
                }
                if let Some(parts) = v
                    .pointer("/candidates/0/content/parts")
                    .and_then(|p| p.as_array())
                {
                    for p in parts {
                        // Skip "thought" parts from thinking models.
                        if p.get("thought").and_then(|t| t.as_bool()).unwrap_or(false) {
                            continue;
                        }
                        if let Some(t) = p.get("text").and_then(|t| t.as_str()) {
                            emit(t);
                        }
                    }
                }
                None
            })
            .await
        }
    }
}

/// Read a streaming body line by line. The handler returns `Some(Ok)` to stop,
/// `Some(Err)` to fail, or `None` to keep reading.
async fn stream_lines<F>(
    resp: reqwest::Response,
    cancel: &AtomicBool,
    mut handle: F,
) -> Result<(), String>
where
    F: FnMut(&str) -> Option<Result<(), String>>,
{
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }
        let next = tokio::time::timeout(Duration::from_secs(120), stream.next())
            .await
            .map_err(|_| "The response stalled for two minutes.".to_string())?;
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.extend_from_slice(&chunk);
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Some(r) = handle(line) {
                return r;
            }
        }
    }
    let rest = String::from_utf8_lossy(&buf);
    let rest = rest.trim();
    if !rest.is_empty() {
        if let Some(r) = handle(rest) {
            return r;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_list_models(app: AppHandle, provider_id: String) -> Result<Vec<String>, String> {
    let settings = app.state::<SettingsStore>().get();
    let client = app.state::<AiState>().client().clone();
    let provider = settings
        .provider(Some(&provider_id))
        .ok_or("Unknown provider")?;
    let key = secrets::get(&secret_name(&provider));
    if provider.needs_key && key.is_none() {
        return Err(format!("Save your {} API key first.", provider.name));
    }
    let b = base(&provider);
    let req = match provider.kind {
        ProviderKind::Ollama => client.get(format!("{b}/api/tags")),
        ProviderKind::Openai => {
            let r = client.get(format!("{b}/models"));
            match &key {
                Some(k) => r.bearer_auth(k),
                None => r,
            }
        }
        ProviderKind::Anthropic => client
            .get(format!("{b}/models?limit=100"))
            .header("x-api-key", key.clone().unwrap_or_default())
            .header("anthropic-version", "2023-06-01"),
        ProviderKind::Gemini => client
            .get(format!("{b}/models?pageSize=200"))
            .header("x-goog-api-key", key.clone().unwrap_or_default()),
    };
    let resp = req
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| describe_error(&provider, &e))?;
    if !resp.status().is_success() {
        return Err(error_from_response(&provider, resp).await);
    }
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<String> = match provider.kind {
        ProviderKind::Ollama => v["models"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|m| m["name"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        ProviderKind::Openai | ProviderKind::Anthropic => v["data"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|m| m["id"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        ProviderKind::Gemini => v["models"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|m| {
                        m["supportedGenerationMethods"]
                            .as_array()
                            .map(|g| g.iter().any(|x| x == "generateContent"))
                            .unwrap_or(true)
                    })
                    .filter_map(|m| {
                        m["name"]
                            .as_str()
                            .map(|n| n.trim_start_matches("models/").to_string())
                    })
                    .collect()
            })
            .unwrap_or_default(),
    };
    models.sort();
    models.dedup();
    Ok(models)
}

// ---------------------------------------------------------------------------
// Web
// ---------------------------------------------------------------------------

pub fn search_url(settings: &Settings, query: &str) -> String {
    let template = match settings.search_engine.as_str() {
        "bing" => "https://www.bing.com/search?q=%s",
        "duckduckgo" => "https://duckduckgo.com/?q=%s",
        "brave" => "https://search.brave.com/search?q=%s",
        "perplexity" => "https://www.perplexity.ai/search?q=%s",
        "kagi" => "https://kagi.com/search?q=%s",
        "startpage" => "https://www.startpage.com/do/search?q=%s",
        "custom" if settings.search_custom_url.contains("%s") => {
            settings.search_custom_url.as_str()
        }
        _ => "https://www.google.com/search?q=%s",
    };
    template.replace("%s", &urlencoding::encode(query))
}

#[tauri::command]
pub fn open_web_search(app: AppHandle, query: String) -> Result<(), String> {
    let settings = app.state::<SettingsStore>().get();
    let url = search_url(&settings, query.trim());
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

async fn search_web(
    settings: &Settings,
    client: &reqwest::Client,
    query: &str,
) -> Result<Vec<Source>, String> {
    let n = settings.grounding_results as usize;
    let query: String = query.chars().take(400).collect();
    match settings.grounding_provider.as_str() {
        "searxng" => {
            let url = format!("{}/search", settings.searxng_url.trim_end_matches('/'));
            let v: Value = client
                .get(url)
                .query(&[("q", query.as_str()), ("format", "json")])
                .timeout(Duration::from_secs(12))
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| format!("{e} (is JSON output enabled on the SearXNG instance?)"))?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            Ok(collect(&v["results"], n, "title", "url", "content"))
        }
        "brave" => {
            let key = secrets::get("search:brave")
                .ok_or("Add a Brave Search API key in Settings → AI.")?;
            let v: Value = client
                .get("https://api.search.brave.com/res/v1/web/search")
                .query(&[("q", query.as_str()), ("count", &n.to_string())])
                .header("X-Subscription-Token", key)
                .header("Accept", "application/json")
                .timeout(Duration::from_secs(12))
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            Ok(collect(
                &v["web"]["results"],
                n,
                "title",
                "url",
                "description",
            ))
        }
        "tavily" => {
            let key =
                secrets::get("search:tavily").ok_or("Add a Tavily API key in Settings → AI.")?;
            let v: Value = client
                .post("https://api.tavily.com/search")
                .bearer_auth(&key)
                .json(&json!({ "query": query, "max_results": n }))
                .timeout(Duration::from_secs(15))
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            Ok(collect(&v["results"], n, "title", "url", "content"))
        }
        _ => Ok(Vec::new()),
    }
}

fn collect(results: &Value, n: usize, title: &str, url: &str, snippet: &str) -> Vec<Source> {
    let strip = |s: &str| {
        // Brave returns <strong> highlights in descriptions.
        let mut out = String::with_capacity(s.len());
        let mut in_tag = false;
        for c in s.chars() {
            match c {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => out.push(c),
                _ => {}
            }
        }
        out.replace("&quot;", "\"")
            .replace("&amp;", "&")
            .replace("&#39;", "'")
    };
    results
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    Some(Source {
                        title: strip(r[title].as_str()?),
                        url: r[url].as_str()?.to_string(),
                        snippet: strip(r[snippet].as_str().unwrap_or(""))
                            .chars()
                            .take(600)
                            .collect(),
                    })
                })
                .take(n)
                .collect()
        })
        .unwrap_or_default()
}
