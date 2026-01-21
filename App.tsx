
import { useState, useRef, useEffect } from 'react';
import { Message, TriageData } from './types';
import { sendMessageToGemini } from './services/gemini';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import TriagePanel from './components/TriagePanel';
import { Info, X, HeartHandshake, Lock, ShieldCheck, Volume2, VolumeX, Loader2, RotateCcw, Download } from 'lucide-react';

// Safe access for environment variables
const env = (import.meta as any).env || {};

function App() {
  // --- State Management ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestTriage, setLatestTriage] = useState<TriageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Language State: Strictly UA or EN
  const [welcomeTab, setWelcomeTab] = useState<'ua' | 'en'>('ua');
  const [privacyTab, setPrivacyTab] = useState<'ua' | 'en'>('ua');
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Audio State
  const [isAutoVoiceEnabled, setIsAutoVoiceEnabled] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Expert Mode (Hidden Logic)
  const [isExpertMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'expert';
    }
    return false;
  });
  const [showMobileTriage, setShowMobileTriage] = useState(false);

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Effects ---

  // Scroll to bottom
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load Voices - Robust Handler for Chrome Async Loading
  useEffect(() => {
    const updateVoices = () => {
      const loaded = window.speechSynthesis.getVoices();
      setVoices(loaded);
    };

    // Try to load immediately
    updateVoices();

    // Listener for async load
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // --- TTS Logic (Hybrid) ---

  const stopAllAudio = () => {
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsLoadingAudio(false);
  };

  useEffect(() => {
    if (!isAutoVoiceEnabled) stopAllAudio();
  }, [isAutoVoiceEnabled]);

  // Auto-read new messages
  useEffect(() => {
    if (!isAutoVoiceEnabled) return;
    const lastMsg = messages[messages.length - 1];
    
    if (lastMsg && lastMsg.role === 'model' && lastMsg.id !== lastSpokenMessageIdRef.current) {
      lastSpokenMessageIdRef.current = lastMsg.id;
      speakText(lastMsg.text);
    }
  }, [messages, isAutoVoiceEnabled]);

  const speakText = async (text: string) => {
    stopAllAudio();
    
    // Clean Markdown characters (*, #, _, etc) for clearer speech
    const cleanText = text.replace(/[*#_`~>]/g, '').trim();
    if (!cleanText) return;

    // Auto-detect language based on text content
    // Check for Cyrillic characters (Ukrainian/Russian letters)
    const isCyrillic = /[а-яА-ЯіїєґІЇЄҐ]/.test(cleanText);
    
    // If Cyrillic -> Use Ukrainian settings (Rate 1.1, UKR voices)
    // If Latin/Other -> Use English settings (Rate 1.0, ENG voices)
    const detectedLang = isCyrillic ? 'uk' : 'en';

    // Use Native Browser TTS
    speakNative(cleanText, detectedLang);
  };

  const getBestVoice = (availableVoices: SpeechSynthesisVoice[], lang: string) => {
    if (lang === 'ua' || lang === 'uk') {
      const ukVoices = availableVoices.filter(v => v.lang.includes('uk') || v.lang.includes('UA'));
      
      if (ukVoices.length === 0) return null;

      // Priority 1: Google Voice
      let selected = ukVoices.find(v => v.name.includes("Google"));
      // Priority 2: "Lesya" (Enhanced Ukrainian)
      if (!selected) selected = ukVoices.find(v => v.name.includes("Lesya"));
      // Priority 3: Enhanced/Premium/Siri
      if (!selected) selected = ukVoices.find(v => v.name.includes("Enhanced") || v.name.includes("Premium") || v.name.includes("Siri"));
      
      return selected || ukVoices[0];
    } 
    
    if (lang === 'en') {
      const enVoices = availableVoices.filter(v => v.lang.startsWith('en'));
      
      if (enVoices.length === 0) return null;

      // Priority for macOS / High Quality voices
      let selected = enVoices.find(v => v.name === "Samantha");
      if (!selected) selected = enVoices.find(v => v.name === "Daniel");
      if (!selected) selected = enVoices.find(v => v.name.includes("Google US"));
      if (!selected) selected = enVoices.find(v => v.name.includes("Google UK"));
      if (!selected) selected = enVoices.find(v => v.name.includes("Premium") || v.name.includes("Enhanced"));
      
      return selected || enVoices[0];
    }

    return null;
  };

  const speakNative = (text: string, lang: string) => {
    setIsLoadingAudio(true);
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set proper language code based on detected language
    const isUA = lang === 'ua' || lang === 'uk';
    utterance.lang = isUA ? 'uk-UA' : 'en-GB';
    
    // Tweak speed: 1.1 for UA (slightly faster), 1.0 for EN (standard)
    utterance.rate = isUA ? 1.1 : 1.0;
    utterance.pitch = 1.0;

    // Smart Voice Selection
    const currentVoices = window.speechSynthesis.getVoices();
    const selectedVoice = getBestVoice(currentVoices, lang);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => setIsLoadingAudio(false);
    utterance.onend = () => setIsLoadingAudio(false);
    utterance.onerror = () => setIsLoadingAudio(false);
    
    window.speechSynthesis.speak(utterance);
  };

  // --- Interaction Handlers ---

  const handleResetChat = () => {
    stopAllAudio();
    setMessages([]);
    setLatestTriage(null);
  };

  const handleDownloadHistory = () => {
    if (messages.length === 0) return;

    const timestamp = new Date().toLocaleString('uk-UA').replace(/[\/:]/g, '-').replace(', ', '_');
    const filename = `TriPsy_Session_${timestamp}.txt`;

    let content = `=== TRIPSY SESSION REPORT ===\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Session Language: ${welcomeTab.toUpperCase()}\n`;
    
    if (latestTriage) {
      content += `\n--- FINAL DIAGNOSTIC DATA ---\n`;
      content += `Urgency: ${latestTriage.urgency}\n`;
      content += `Topic: ${latestTriage.topic}\n`;
      content += `Model Used: ${latestTriage.modelUsed || 'Unknown'}\n`;
      content += `Suggested Action: ${latestTriage.suggested_action}\n`;
      content += `Keywords: ${latestTriage.flagged_keywords?.join(', ') || 'None'}\n`;
    }

    content += `\n--- TRANSCRIPT ---\n\n`;

    messages.forEach(msg => {
      const role = msg.role === 'user' ? 'USER' : 'BOT';
      const time = msg.timestamp.toLocaleTimeString();
      content += `[${time}] ${role}:\n${msg.text}\n\n`;
    });

    content += `\n=== END OF REPORT ===\n`;

    const blob = new window.Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleVoiceToggle = () => {
    const newState = !isAutoVoiceEnabled;
    setIsAutoVoiceEnabled(newState);
    if (newState && messages.length === 0) {
      const text = welcomeTab === 'ua' 
        ? "Вітаю! Мене звати TriPsy. Я — ШІ-чат первинної психологічної підтримки. Поділіться зі мною своїми думками."
        : "Hello! My name is TriPsy. I am an AI initial psychological support chat. Share your thoughts with me.";
      speakText(text);
    }
  };

  // --- LOGGING SERVICE ---
  const logInteraction = async (userText: string, botResponse: any) => {
    // Fire and forget - do not await
    try {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText,
          botResponse: botResponse.text,
          triage: botResponse.triage,
          modelUsed: botResponse.modelUsed,
          timestamp: new Date().toISOString(),
          language: welcomeTab // Added language to log
        })
      }).catch(err => console.error("Logging failed silently:", err));
    } catch (e) {
      // Ignore errors to prevent UI disruption
    }
  };

  const handleSendMessage = async (text: string) => {
    if (isAutoVoiceEnabled) stopAllAudio();
    
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await sendMessageToGemini(messages, text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text,
        timestamp: new Date(),
        triage: response.triage || undefined
      };
      
      // Update triage with the model used
      if (response.triage) {
        setLatestTriage({
          ...response.triage,
          modelUsed: response.modelUsed
        });
      }
      
      setMessages(prev => [...prev, botMsg]);

      // --- TRIGGER LOGGING ---
      logInteraction(text, response);

    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: welcomeTab === 'ua' ? "Вибачте, сталася помилка з'єднання." : "I apologize, connection error occurred.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render Helpers ---

  const showSos = latestTriage?.urgency === 'CRITICAL' || latestTriage?.urgency === 'HIGH';

  const renderPrivacyContent = () => {
    if (privacyTab === 'ua') {
      return (
        <div className="space-y-6 text-sm leading-relaxed">
          <section><h3 className="font-bold mb-2">1. Про сервіс</h3><p>TriPsy — це помічник психологічної підтримки на базі ШІ. Він надає первинну емоційну допомогу, але <strong>не замінює лікаря</strong>.</p></section>
          <section><h3 className="font-bold mb-2">2. Конфіденційність</h3><p>Сесія існує лише в пам'яті браузера. При оновленні сторінки історія зникає.</p></section>
          <section className="bg-teal-50 p-4 rounded-xl border border-teal-100 text-teal-800"><h3 className="font-bold mb-1">Екстрена допомога</h3><p>При загрозі життю телефонуйте 112.</p></section>
        </div>
      );
    }
    return (
      <div className="space-y-6 text-sm leading-relaxed">
        <section><h3 className="font-bold mb-2">1. Service</h3><p>TriPsy is an AI support assistant. It provides emotional support but <strong>is not a doctor</strong>.</p></section>
        <section><h3 className="font-bold mb-2">2. Privacy</h3><p>Sessions exist only in browser memory. Refreshing clears history.</p></section>
        <section className="bg-teal-50 p-4 rounded-xl border border-teal-100 text-teal-800"><h3 className="font-bold mb-1">Emergency</h3><p>If in danger, call 112 immediately.</p></section>
      </div>
    );
  };

  return (
    // MAIN CONTAINER: 100dvh for mobile stability
    <div className="h-[100dvh] flex flex-col bg-teal-50/50 overflow-hidden">
      
      {/* HEADER */}
      <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.reload()}>
          <div className="bg-teal-100 p-2 rounded-xl"><HeartHandshake className="w-6 h-6 text-teal-600" /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-none">TriPsy</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {welcomeTab === 'ua' ? 'Поруч, коли важко' : "Here when it's hard"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Download Session Button - ONLY IN EXPERT MODE */}
          {isExpertMode && messages.length > 0 && (
            <button 
              onClick={handleDownloadHistory}
              className="p-2 rounded-full bg-slate-50 text-slate-500 hover:text-teal-600 hover:bg-teal-50 transition-all border border-transparent hover:border-teal-100"
              title={welcomeTab === 'ua' ? "Зберегти звіт" : "Download Report"}
            >
              <Download className="w-5 h-5" />
            </button>
          )}

          {/* Reset Chat Button */}
          <button 
            onClick={handleResetChat}
            className="p-2 rounded-full bg-slate-50 text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-all border border-transparent hover:border-teal-100"
            title="Reset Chat"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          {/* Voice Toggle Button */}
          <button onClick={handleVoiceToggle} className={`p-2 rounded-full border transition-all ${isAutoVoiceEnabled ? 'bg-teal-100 text-teal-700 border-teal-200' : 'bg-slate-50 text-slate-400 border-transparent'}`}>
            {isLoadingAudio ? <Loader2 className="w-5 h-5 animate-spin text-teal-600" /> : isAutoVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          
          {isExpertMode && (
            <button className="lg:hidden p-2 text-slate-500" onClick={() => setShowMobileTriage(!showMobileTriage)}>
              <Info className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* CONTENT AREA: Flex Row for Expert Mode Side Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* CHAT COLUMN */}
        <div className="flex-1 flex flex-col h-full relative">
          
          {/* SCROLLABLE MESSAGES */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 pb-4 scroll-smooth">
            <div className="max-w-2xl mx-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6 animate-fade-in py-8">
                  <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center shadow-sm">
                    <HeartHandshake className="w-8 h-8 text-teal-600" />
                  </div>
                  
                  {/* Language Switcher: Emojis Only */}
                  <div className="flex p-1 bg-slate-200/60 rounded-xl">
                    <button onClick={() => setWelcomeTab('ua')} className={`px-4 py-1.5 rounded-lg transition-all ${welcomeTab === 'ua' ? 'bg-white shadow-sm' : 'hover:bg-slate-100/50'}`}>
                      <span className="text-2xl">🇺🇦</span>
                    </button>
                    <button onClick={() => setWelcomeTab('en')} className={`px-4 py-1.5 rounded-lg transition-all ${welcomeTab === 'en' ? 'bg-white shadow-sm' : 'hover:bg-slate-100/50'}`}>
                      <span className="text-2xl">🇬🇧</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-w-sm">
                    <p className="text-xl font-bold text-slate-800">
                      {welcomeTab === 'ua' ? "Вітаю! Мене звати TriPsy." : "Hello! My name is TriPsy."}
                    </p>
                    <p className="text-base text-slate-600 leading-relaxed">
                      {welcomeTab === 'ua' 
                        ? "Я — ШІ-чат первинної психологічної підтримки. Поділіться зі мною своїми думками."
                        : "I am an AI initial psychological support chat. Share your thoughts with me."}
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <button onClick={() => { setPrivacyTab(welcomeTab); setShowPrivacy(true); }} className="text-xs font-medium text-slate-400 hover:text-teal-600 flex items-center gap-1 transition-colors mt-4">
                      <Lock className="w-3 h-3" />
                      {welcomeTab === 'ua' ? "Гарантії конфіденційності" : "Privacy Guarantees"}
                    </button>
                    
                    <p className="text-xs text-slate-500 mt-6 text-center font-medium opacity-80 max-w-[280px]">
                      {welcomeTab === 'ua' 
                        ? "При загрозі життю телефонуйте 112" 
                        : "In case of life threat, call 112"}
                    </p>
                  </div>
                </div>
              ) : (
                messages.map(msg => <ChatMessage key={msg.id} message={msg} language={welcomeTab} />)
              )}
              
              {isLoading && (
                <div className="flex justify-start mb-6 pl-4">
                  <div className="bg-slate-100 rounded-2xl rounded-tl-none px-4 py-3 flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75" />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* INPUT AREA (Fixed at bottom of this column) */}
          <ChatInput 
            onSend={handleSendMessage} 
            isLoading={isLoading} 
            language={welcomeTab} 
            showSos={showSos} 
            sosLanguage={welcomeTab} 
          />
        </div>

        {/* EXPERT MODE: SIDEBAR */}
        {isExpertMode && (
          <div className="hidden lg:block w-80 border-l border-slate-200 bg-white/50 backdrop-blur-sm h-full overflow-y-auto p-4">
            <TriagePanel data={latestTriage} />
          </div>
        )}
      </div>

      {/* EXPERT MODE: MOBILE OVERLAY */}
      {showMobileTriage && isExpertMode && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowMobileTriage(false)} />
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-bold">Analysis</h2>
              <button onClick={() => setShowMobileTriage(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto bg-slate-50 flex-1"><TriagePanel data={latestTriage} /></div>
          </div>
        </div>
      )}

      {/* PRIVACY MODAL */}
      {showPrivacy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowPrivacy(false)} />
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col z-10 overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 flex justify-between items-center">
              <h2 className="font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600"/> 
                {privacyTab === 'ua' ? 'Конфіденційність' : 'Privacy Policy'}
              </h2>
              <button onClick={() => setShowPrivacy(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 overflow-y-auto text-slate-600">
              {renderPrivacyContent()}
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setShowPrivacy(false)} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                {privacyTab === 'ua' ? 'Зрозуміло' : 'I Understand'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
