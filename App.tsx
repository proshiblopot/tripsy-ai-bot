
import { useState, useRef, useEffect } from 'react';
import { Message, TriageData } from './types';
import { sendMessageToGemini } from './services/gemini';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import TriagePanel from './components/TriagePanel';
import { Info, HeartHandshake, Lock, ShieldCheck, Volume2, VolumeX, Loader2, RotateCcw, Download, AlertCircle } from 'lucide-react';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestTriage, setLatestTriage] = useState<TriageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [welcomeTab, setWelcomeTab] = useState<'ua' | 'en'>('ua');
  const [isAutoVoiceEnabled, setIsAutoVoiceEnabled] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  const [isExpertMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'expert';
    }
    return false;
  });
  const [showMobileTriage, setShowMobileTriage] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastSpokenMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const stopAllAudio = () => {
    window.speechSynthesis.cancel();
    setIsLoadingAudio(false);
  };

  useEffect(() => {
    if (!isAutoVoiceEnabled) stopAllAudio();
  }, [isAutoVoiceEnabled]);

  useEffect(() => {
    if (!isAutoVoiceEnabled) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'model' && lastMsg.id !== lastSpokenMessageIdRef.current) {
      lastSpokenMessageIdRef.current = lastMsg.id;
      speakText(lastMsg.text);
    }
  }, [messages, isAutoVoiceEnabled]);

  const speakText = (text: string) => {
    stopAllAudio();
    const cleanText = text.replace(/[*#_`~>]/g, '').replace(/```json[\s\S]*?```/g, '').trim();
    if (!cleanText) return;
    const isCyrillic = /[а-яА-ЯіїєґІЇЄҐ]/.test(cleanText);
    
    setIsLoadingAudio(true);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = isCyrillic ? 'uk-UA' : 'en-GB';
    
    utterance.onstart = () => setIsLoadingAudio(false);
    utterance.onend = () => setIsLoadingAudio(false);
    utterance.onerror = () => setIsLoadingAudio(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleResetChat = () => {
    stopAllAudio();
    setMessages([]);
    setLatestTriage(null);
  };

  const handleDownloadHistory = () => {
    if (messages.length === 0) return;
    const timestamp = new Date().toLocaleString('uk-UA').replace(/[\/:]/g, '-').replace(', ', '_');
    let content = `=== TRIPSY SESSION REPORT ===\nDate: ${new Date().toLocaleString()}\n`;
    if (latestTriage) {
      content += `\nUrgency: ${latestTriage.urgency}\nTopic: ${latestTriage.topic}\nModel: ${latestTriage.modelUsed}\n`;
    }
    content += `\n--- TRANSCRIPT ---\n`;
    messages.forEach(msg => {
      content += `[${msg.timestamp.toLocaleTimeString()}] ${msg.role.toUpperCase()}: ${msg.text}\n\n`;
    });
    const blob = new window.Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TriPsy_Session_${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendMessage = async (text: string) => {
    if (isAutoVoiceEnabled) stopAllAudio();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Перевірка наявності ключа. Пріоритет VITE_GOOGLE_API_KEY як у gemini.ts
      const key = (import.meta as any).env?.VITE_GOOGLE_API_KEY || process.env.API_KEY;
      if (!key) {
         throw new Error("API Key (VITE_GOOGLE_API_KEY) is missing");
      }

      const response = await sendMessageToGemini(messages, text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text,
        timestamp: new Date(),
        triage: response.triage || undefined
      };
      if (response.triage) setLatestTriage({ ...response.triage, modelUsed: response.modelUsed });
      setMessages(prev => [...prev, botMsg]);
    } catch (error: any) {
      console.error("App: Message error", error);
      let errorText = welcomeTab === 'ua' 
        ? "Помилка зв'язку з AI. Будь ласка, переконайтеся, що VITE_GOOGLE_API_KEY встановлено правильно." 
        : "AI Connection Error. Please ensure VITE_GOOGLE_API_KEY is correctly set.";
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: errorText,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-teal-50/50 overflow-hidden">
      <header className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.reload()}>
          <div className="bg-teal-100 p-2 rounded-xl"><HeartHandshake className="w-6 h-6 text-teal-600" /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-none">TriPsy</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{welcomeTab === 'ua' ? 'Поруч' : "Here"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExpertMode && messages.length > 0 && (
            <button onClick={handleDownloadHistory} className="p-2 rounded-full bg-slate-50 text-slate-500 hover:text-teal-600 transition-all border border-transparent">
              <Download className="w-5 h-5" />
            </button>
          )}
          <button onClick={handleResetChat} title="Reset" className="p-2 rounded-full bg-slate-50 text-slate-400 hover:text-teal-600 transition-all"><RotateCcw className="w-5 h-5" /></button>
          <button onClick={() => setIsAutoVoiceEnabled(!isAutoVoiceEnabled)} className={`p-2 rounded-full border transition-all ${isAutoVoiceEnabled ? 'bg-teal-100 text-teal-700' : 'text-slate-400'}`}>
            {isLoadingAudio ? <Loader2 className="w-5 h-5 animate-spin" /> : isAutoVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          {isExpertMode && <button className="lg:hidden p-2 text-slate-500" onClick={() => setShowMobileTriage(!showMobileTriage)}><Info className="w-5 h-5" /></button>}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col h-full relative">
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 pb-4">
            <div className="max-w-2xl mx-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6 py-8">
                  <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center"><HeartHandshake className="w-8 h-8 text-teal-600" /></div>
                  <div className="flex p-1 bg-slate-200/60 rounded-xl">
                    <button onClick={() => setWelcomeTab('ua')} className={`px-4 py-1.5 rounded-lg ${welcomeTab === 'ua' ? 'bg-white shadow-sm' : ''}`}><span className="text-2xl">🇺🇦</span></button>
                    <button onClick={() => setWelcomeTab('en')} className={`px-4 py-1.5 rounded-lg ${welcomeTab === 'en' ? 'bg-white shadow-sm' : ''}`}><span className="text-2xl">🇬🇧</span></button>
                  </div>
                  <p className="text-xl font-bold text-slate-800">{welcomeTab === 'ua' ? "Вітаю! Я TriPsy. Чим можу допомогти?" : "Hello! I am TriPsy. How can I support you today?"}</p>
                </div>
              ) : (
                messages.map(msg => <ChatMessage key={msg.id} message={msg} language={welcomeTab} />)
              )}
              {isLoading && (
                <div className="flex justify-start mb-6 pl-4 animate-pulse">
                   <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                      <span className="text-sm text-slate-400">{welcomeTab === 'ua' ? 'Трипси думає...' : 'TriPsy is thinking...'}</span>
                   </div>
                </div>
              )}
            </div>
          </div>
          <ChatInput onSend={handleSendMessage} isLoading={isLoading} language={welcomeTab} showSos={latestTriage?.urgency === 'CRITICAL' || latestTriage?.urgency === 'HIGH'} sosLanguage={welcomeTab} />
        </div>
        {isExpertMode && (
          <div className="hidden lg:block w-80 border-l border-slate-200 bg-white h-full overflow-y-auto p-4"><TriagePanel data={latestTriage} /></div>
        )}
      </div>

      {showMobileTriage && isExpertMode && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowMobileTriage(false)} />
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col p-4"><TriagePanel data={latestTriage} /></div>
        </div>
      )}
    </div>
  );
}

export default App;
