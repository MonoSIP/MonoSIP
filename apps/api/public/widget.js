/*!
 * MunaSIP website call widget — drop-in script.
 * Usage: <script src="https://pbx.example.com/widget.js" data-widget="w_xxxx" async></script>
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-widget");
  if (!key) {
    console.warn("[MunaSIP widget] data-widget attribute required");
    return;
  }
  var base =
    script.getAttribute("data-base") ||
    (function () {
      try {
        return new URL(script.src).origin;
      } catch (e) {
        return window.location.origin;
      }
    })();

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "style" && typeof attrs[k] === "object") {
          Object.assign(n.style, attrs[k]);
        } else if (k === "text") {
          n.textContent = attrs[k];
        } else {
          n.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c) n.appendChild(c);
    });
    return n;
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(base + path, {
      method: opts.method || "GET",
      headers: Object.assign({ "Content-Type": "application/json" }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "omit",
      mode: "cors",
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || r.statusText);
        return j;
      });
    });
  }

  var panelOpen = false;
  var inCall = false;
  var ua = null;
  var session = null;
  var remoteAudio = null;

  function loadSipJs() {
    if (window.SIP) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/sip.js@0.21.2/distribution/sip.min.js";
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("Failed to load sip.js"));
      };
      document.head.appendChild(s);
    });
  }

  function hangup() {
    inCall = false;
    try {
      if (session) {
        if (session.state === "Established") session.bye();
        else if (session.cancel) session.cancel();
      }
    } catch (e) {}
    session = null;
    try {
      if (ua) ua.stop();
    } catch (e) {}
    ua = null;
    if (remoteAudio) {
      remoteAudio.srcObject = null;
    }
  }

  function startCall(cfg, name) {
    return loadSipJs()
      .then(function () {
        return api("/api/v1/public/widgets/" + encodeURIComponent(key) + "/session", {
          method: "POST",
          body: { callerName: name || undefined },
        });
      })
      .then(function (cred) {
        inCall = true;
        setStatus(cfg.locale === "tr" ? "Bağlanıyor…" : "Connecting…");
        var SIP = window.SIP;
        var uri = SIP.UserAgent.makeURI("sip:" + cred.extension + "@" + cred.domain);
        ua = new SIP.UserAgent({
          uri: uri,
          authorizationUsername: cred.extension,
          authorizationPassword: cred.password,
          displayName: cred.displayName,
          transportOptions: { server: cred.websocketUrl },
          sessionDescriptionHandlerFactoryOptions: {
            constraints: { audio: true, video: false },
            peerConnectionConfiguration: { iceServers: cred.iceServers || [] },
          },
          logLevel: "error",
        });
        return ua.start().then(function () {
          var target = SIP.UserAgent.makeURI("sip:" + cred.dial + "@" + cred.domain);
          var inviter = new SIP.Inviter(ua, target);
          session = inviter;
          inviter.stateChange.addListener(function (state) {
            if (state === SIP.SessionState.Established) {
              setStatus(cfg.locale === "tr" ? "Görüşmede" : "In call");
              var sdh = inviter.sessionDescriptionHandler;
              var pc = sdh && sdh.peerConnection;
              if (pc) {
                pc.getReceivers().forEach(function (r) {
                  if (r.track && r.track.kind === "audio" && remoteAudio) {
                    remoteAudio.srcObject = new MediaStream([r.track]);
                    remoteAudio.play().catch(function () {});
                  }
                });
              }
              if (cred.maxCallSeconds) {
                setTimeout(function () {
                  hangup();
                  setStatus(cfg.locale === "tr" ? "Süre doldu" : "Call ended");
                }, cred.maxCallSeconds * 1000);
              }
            }
            if (state === SIP.SessionState.Terminated) {
              hangup();
              setStatus(cfg.locale === "tr" ? "Çağrı bitti" : "Call ended");
            }
          });
          return inviter.invite();
        });
      });
  }

  var statusEl = null;
  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
  }

  api("/api/v1/public/widgets/" + encodeURIComponent(key))
    .then(function (cfg) {
      remoteAudio = el("audio", { autoplay: "true", playsinline: "true" });
      remoteAudio.style.display = "none";
      document.body.appendChild(remoteAudio);

      var pos = cfg.position === "bottom-left" ? { left: "20px", right: "auto" } : { right: "20px", left: "auto" };
      var btn = el("button", {
        type: "button",
        text: cfg.buttonText || "Call us",
        style: Object.assign(
          {
            position: "fixed",
            bottom: "20px",
            zIndex: "2147483000",
            padding: "12px 18px",
            borderRadius: "999px",
            border: "none",
            cursor: "pointer",
            color: "#fff",
            background: cfg.buttonColor || "#0f766e",
            font: "600 14px/1.2 system-ui,sans-serif",
            boxShadow: "0 8px 24px rgba(0,0,0,.2)",
          },
          pos,
        ),
      });

      var panel = el("div", {
        style: Object.assign(
          {
            position: "fixed",
            bottom: "72px",
            zIndex: "2147483001",
            width: "300px",
            padding: "16px",
            borderRadius: "12px",
            background: "#fff",
            color: "#0f172a",
            boxShadow: "0 12px 40px rgba(0,0,0,.25)",
            font: "14px/1.4 system-ui,sans-serif",
            display: "none",
          },
          pos,
        ),
      });

      statusEl = el("p", { text: "", style: { margin: "0 0 10px", minHeight: "1.2em", color: "#64748b" } });
      var nameInput = cfg.askName
        ? el("input", {
            type: "text",
            placeholder: cfg.locale === "tr" ? "Adınız" : "Your name",
            style: {
              width: "100%",
              boxSizing: "border-box",
              marginBottom: "8px",
              padding: "8px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
            },
          })
        : null;
      var phoneInput = cfg.callbackEnabled
        ? el("input", {
            type: "tel",
            placeholder: cfg.locale === "tr" ? "Telefon numaranız" : "Your phone number",
            style: {
              width: "100%",
              boxSizing: "border-box",
              marginBottom: "8px",
              padding: "8px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
            },
          })
        : null;

      var callBtn = cfg.browserCallEnabled
        ? el("button", {
            type: "button",
            text: cfg.locale === "tr" ? "Tarayıcıdan ara" : "Call from browser",
            style: {
              width: "100%",
              padding: "10px",
              marginBottom: "6px",
              border: "none",
              borderRadius: "8px",
              background: cfg.buttonColor || "#0f766e",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "600",
            },
          })
        : null;

      var cbBtn = cfg.callbackEnabled
        ? el("button", {
            type: "button",
            text: cfg.locale === "tr" ? "Beni ara" : "Call me back",
            style: {
              width: "100%",
              padding: "10px",
              marginBottom: "6px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              background: "#f8fafc",
              cursor: "pointer",
            },
          })
        : null;

      var endBtn = el("button", {
        type: "button",
        text: cfg.locale === "tr" ? "Kapat" : "Hang up",
        style: {
          width: "100%",
          padding: "10px",
          border: "none",
          borderRadius: "8px",
          background: "#be123c",
          color: "#fff",
          cursor: "pointer",
          display: "none",
        },
      });

      if (callBtn) {
        callBtn.onclick = function () {
          if (inCall) return;
          callBtn.disabled = true;
          startCall(cfg, nameInput && nameInput.value)
            .then(function () {
              endBtn.style.display = "block";
              if (callBtn) callBtn.style.display = "none";
              if (cbBtn) cbBtn.style.display = "none";
            })
            .catch(function (e) {
              setStatus(e.message || String(e));
              callBtn.disabled = false;
            });
        };
      }
      if (cbBtn) {
        cbBtn.onclick = function () {
          var phone = phoneInput && phoneInput.value;
          if (!phone) {
            setStatus(cfg.locale === "tr" ? "Numara girin" : "Enter a phone number");
            return;
          }
          cbBtn.disabled = true;
          api("/api/v1/public/widgets/" + encodeURIComponent(key) + "/callback", {
            method: "POST",
            body: { phone: phone, name: (nameInput && nameInput.value) || undefined },
          })
            .then(function (r) {
              setStatus(r.message || (cfg.locale === "tr" ? "Sizi arayacağız" : "We will call you"));
            })
            .catch(function (e) {
              setStatus(e.message || String(e));
            })
            .finally(function () {
              cbBtn.disabled = false;
            });
        };
      }
      endBtn.onclick = function () {
        hangup();
        endBtn.style.display = "none";
        if (callBtn) {
          callBtn.style.display = "block";
          callBtn.disabled = false;
        }
        if (cbBtn) cbBtn.style.display = "block";
        setStatus("");
      };

      panel.appendChild(el("strong", { text: cfg.name || "MunaSIP", style: { display: "block", marginBottom: "8px" } }));
      panel.appendChild(statusEl);
      if (nameInput) panel.appendChild(nameInput);
      if (phoneInput) panel.appendChild(phoneInput);
      if (callBtn) panel.appendChild(callBtn);
      if (cbBtn) panel.appendChild(cbBtn);
      panel.appendChild(endBtn);

      btn.onclick = function () {
        panelOpen = !panelOpen;
        panel.style.display = panelOpen ? "block" : "none";
        if (!panelOpen && inCall) hangup();
      };

      document.body.appendChild(btn);
      document.body.appendChild(panel);
    })
    .catch(function (e) {
      console.warn("[MunaSIP widget]", e.message || e);
    });
})();
