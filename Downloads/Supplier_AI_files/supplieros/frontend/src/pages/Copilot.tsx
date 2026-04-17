import { useEffect, useRef, useState } from "react";
import { api } from "../utils/api";
import { parseMd } from "../utils/format";
import type { ChatMessage } from "../types";

const SUGGESTIONS = [
  "What are my top 5 growth opportunities at Walmart this quarter?",
  "Which SKUs should I replace on the Target planogram and why?",
  "Where am I losing market share versus my top competitors?",
  "Analyze my Costco promo ROI and recommend improvements",
  "What should I pitch to Target buyers next quarter?",
  "Which distribution gaps have the highest revenue upside?",
];

function TypingBubble() {
  return (
    <div style={{
      padding: "12px 16px", borderRadius: 12, borderBottomLeftRadius: 4,
      background: "var(--card)", border: "1px solid var(--bordermd)",
      display: "flex", gap: 4, alignItems: "center",
    }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: "50%", background: "var(--text3)",
            animation: `typing 1.2s ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function MsgBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "88%", alignSelf: isUser ? "flex-end" : "flex-start" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text3)", textTransform: "uppercase", textAlign: isUser ? "right" : "left" }}>
        {isUser ? "You" : "SupplierOS AI"}
      </div>
      <div style={{
        padding: "12px 16px",
        borderRadius: 12,
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
        background: isUser
          ? "linear-gradient(135deg,#1e3a8a,#1d4ed8)"
          : "var(--card)",
        border: isUser
          ? "1px solid rgba(59,130,246,.35)"
          : "1px solid var(--bordermd)",
        fontSize: 13,
        lineHeight: 1.65,
        color: "var(--text)",
      }}
        dangerouslySetInnerHTML={{ __html: parseMd(msg.content) }}
      />
      {!isUser && msg.metadata?.sources && msg.metadata.sources.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
          <span style={{ fontSize: 10, color: "var(--text3)" }}>Sources:</span>
          {msg.metadata.sources.map((s: string) => (
            <span key={s} style={{ fontSize: 10, background: "rgba(255,255,255,.04)", color: "var(--text3)", padding: "1px 6px", borderRadius: 4 }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Copilot() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  // Init session on mount
  useEffect(() => {
    api.chat.createSession().then(s => {
      setSessionId(s.session_id);
      return api.chat.getMessages(s.session_id) as Promise<ChatMessage[]>;
    }).then(msgs => setMessages(msgs));
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (windowRef.current) {
      windowRef.current.scrollTop = windowRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const send = async (text?: string) => {
    const q = (text || input).trim();
    if (!q || !sessionId || sending) return;
    setInput("");
    setSending(true);
    // Optimistic user message
    const tempUser: ChatMessage = {
      id: Date.now(), session_id: sessionId,
      role: "user", content: q,
      metadata: {}, created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUser]);
    try {
      const reply = await api.chat.sendMessage(sessionId, q) as ChatMessage;
      setMessages(prev => [...prev, reply]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, session_id: sessionId,
        role: "assistant", content: "Sorry — I encountered an error. Please try again.",
        metadata: {}, created_at: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  };

  const hasMsgs = messages.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: "18px 24px 14px", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)",
            border: "1px solid rgba(59,130,246,.35)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>✦</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>AI Revenue Co-Pilot</div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>
              Ask anything about your portfolio — SKUs, retailers, share, promotions, or what to do next
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 11, background: "var(--greendim)", color: "var(--green)", border: "1px solid rgba(34,197,94,.2)", padding: "4px 10px", borderRadius: 20, fontWeight: 600 }}>
              ● Live data
            </div>
          </div>
        </div>
      </div>

      {/* Chat window */}
      <div
        ref={windowRef}
        style={{
          flex: 1, overflowY: "auto", padding: "20px 24px",
          display: "flex", flexDirection: "column", gap: 14,
          maxWidth: 860, width: "100%", margin: "0 auto",
          alignSelf: "stretch",
        }}
      >
        {messages.map(m => <MsgBubble key={m.id} msg={m} />)}
        {sending && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text3)", textTransform: "uppercase" }}>
              SupplierOS AI
            </div>
            <TypingBubble />
          </div>
        )}
      </div>

      {/* Suggestions (only before first user message) */}
      {!hasMsgs && (
        <div style={{ padding: "0 24px 16px", maxWidth: 860, width: "100%", margin: "0 auto", alignSelf: "stretch" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  background: "rgba(255,255,255,.02)", border: "1px solid var(--bordermd)",
                  borderRadius: 8, padding: "10px 14px", fontFamily: "inherit",
                  fontSize: 12, color: "var(--text2)", cursor: "pointer",
                  transition: "all .12s", textAlign: "left", lineHeight: 1.4,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "rgba(59,130,246,.4)";
                  e.currentTarget.style.color = "var(--bluelight)";
                  e.currentTarget.style.background = "var(--bluedim)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "var(--bordermd)";
                  e.currentTarget.style.color = "var(--text2)";
                  e.currentTarget.style.background = "rgba(255,255,255,.02)";
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "14px 24px 20px", borderTop: "1px solid var(--border)",
        maxWidth: 860, width: "100%", margin: "0 auto", alignSelf: "stretch",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about opportunities, SKU performance, retailer strategy, promo ROI, competitive share..."
            style={{
              flex: 1, background: "var(--card)", border: "1px solid var(--bordermd)",
              borderRadius: 8, padding: "11px 16px", fontFamily: "inherit",
              fontSize: 13, color: "var(--text)", outline: "none",
              transition: "border-color .15s",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(59,130,246,.5)"}
            onBlur={e => e.target.style.borderColor = "var(--bordermd)"}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || sending}
            style={{
              background: "var(--blue)", border: "none", borderRadius: 8,
              padding: "11px 20px", fontFamily: "inherit", fontSize: 13,
              fontWeight: 500, color: "#fff", cursor: "pointer",
              opacity: (!input.trim() || sending) ? 0.5 : 1,
              transition: "opacity .15s, background .15s",
            }}
          >
            {sending ? "…" : "Send ↗"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
          Powered by live POS data, Circana syndicated feeds, and Walmart Luminate · Press Enter to send
        </div>
      </div>
    </div>
  );
}
