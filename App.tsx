import React, { useState, useRef, useEffect } from 'react';
import { Message, TriageData } from './types';
import { sendMessageToGemini } from './services/gemini';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import TriagePanel from './components/TriagePanel';
import { Info, X, HeartHandshake, Lock, ShieldCheck, Volume2, VolumeX, Loader2 } from 'lucide-react';

// Safe access for environment variables
const env = (import.meta as any).env || {};
// Note: HF_TOKEN is now handled server-side in /api/tts.js

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestTriage, setLatestTriage] = useState<TriageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileTriage, setShowMobileTriage] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [isAutoVoiceEnabled, setIsAutoVoiceEnabled] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  // Expert Mode Logic
  const [isExpertMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'expert';
    }
    return false;
  });
  
  // Default language set to Ukrainian ('ua')
  const [privacyTab, setPrivacyTab] = useState<'ua' | 'en'>('ua');
  const [welcomeTab, setWelcomeTab] = useState<'ua' | 'en'>('ua');
  
  // Store available system voices for fallback
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- Auto-Voice Logic ---

  // Load available voices on mount
  useEffect(() => {
    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Stop all audio logic
  const stopAllAudio = () => {
    // Stop browser TTS
    window.speechSynthesis.cancel();
    // Stop HF Audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsLoadingAudio(false);
  };

  // Stop speaking if user disables the feature
  useEffect(() => {
    if (!isAutoVoiceEnabled) {
      stopAllAudio();
    }
  }, [isAutoVoiceEnabled]);

  // Monitor new messages for auto-speech
  useEffect(() => {
    if (!isAutoVoiceEnabled) return;

    const lastMsg = messages[messages.length - 1];

    if (lastMsg && lastMsg.role === 'model' && lastMsg.id !== lastSpokenMessageIdRef.current) {
      lastSpokenMessageIdRef.current = lastMsg.id;
      
      // Determine language code: 'ua', or 'en'
      const langCode = latestTriage?.language || welcomeTab;
      
      speakText(lastMsg.text, langCode);
    }
  }, [messages, isAutoVoiceEnabled, latestTriage, welcomeTab]);

  // Hybrid Speak Function
  const speakText = async (text: string, langCode: string) => {
    stopAllAudio();
    
    // Check if language is Ukrainian
    if (langCode === 'ua' || langCode === 'uk') {
      // Use Browser Native for Ukrainian
      speakBrowserUA(text);
    } else {
      // Use Server API for others (EN)
      speakServerApi(text, langCode);
    }
  };

  // 1. Browser-native TTS for Ukrainian
  const speakBrowserUA = (text: string) => {
    setIsLoadingAudio(true); // Show spinner briefly while setting up

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'uk-UA';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    // Voice selection logic for UA
    const currentVoices = voices.length > 0 ? voices : window.speechSynthesis.getVoices();
    const ukVoices = currentVoices.filter(v => v.lang.includes('uk') || v.lang.includes('UA'));

    const preferredNames = ["Google", "Lesya", "Milena", "UKR"];
    const selectedVoice = ukVoices.find(v => 
      preferredNames.some(name => v.name.includes(name))
    );

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else if (ukVoices.length > 0) {
      utterance.voice = ukVoices[0];
    }

    // Spinner Logic: Hide when it actually starts speaking
    utterance.onstart = () => setIsLoadingAudio(false);
    utterance.onend = () => setIsLoadingAudio(false);
    utterance.onerror = (e) => {
      console.error("Browser TTS Error:", e);
      setIsLoadingAudio(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // 2. Server API TTS for Other Languages
  const speakServerApi = async (text: string, langCode: string) => {
    setIsLoadingAudio(true);
    
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text, lang: langCode }),
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsLoadingAudio(false);
        URL.revokeObjectURL(audioUrl); // Cleanup
      };

      audio.onplay = () => {
         // Audio started successfully
      };

      audio.onerror = () => {
        console.error("Audio playback error");
        setIsLoadingAudio(false);
      };

      await audio.play();

    } catch (error) {
      console.error("TTS Generation failed:", error);
      setIsLoadingAudio(false);
    }
  };

  // Helper to get welcome text for TTS
  const getWelcomeMessageText = (lang: 'ua' | 'en') => {
    switch (lang) {
      case 'en':
        return "Hello! My name is TriPsy. I am an AI initial psychological support chat. Share your thoughts with me.";
      case 'ua':
      default:
        return "Вітаю! Мене звати TriPsy. Я — ШІ-чат первинної психологічної підтримки. Поділіться зі мною своїми думками.";
    }
  };

  // Handle Voice Toggle
  const handleVoiceToggle = () => {
    const newState = !isAutoVoiceEnabled;
    setIsAutoVoiceEnabled(newState);

    // If turning on voice and chat is empty, speak the welcome message
    if (newState && messages.length === 0) {
      const text = getWelcomeMessageText(welcomeTab);
      speakText(text, welcomeTab);
    }
  };

  // ------------------------

  const handleSendMessage = async (text: string) => {
    // Stop any ongoing speech when user sends a new message
    if (isAutoVoiceEnabled) {
      stopAllAudio();
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date(),
    };

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

      if (response.triage) {
        setLatestTriage(response.triage);
      }

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error("Error sending message", error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        text: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const getHeaderSubtitle = () => {
    switch (welcomeTab) {
      case 'en':
        return "Here when it's hard";
      case 'ua':
      default:
        return "Поруч, коли важко";
    }
  };

  const getConfidentialityText = () => {
    switch (welcomeTab) {
      case 'en':
        return "Privacy Guarantees";
      case 'ua':
      default:
        return "Гарантії конфіденційності";
    }
  };

  // Determine if SOS button should be shown in input area
  const showSos = latestTriage?.urgency === 'CRITICAL' || latestTriage?.urgency === 'HIGH';
  
  // Use welcomeTab for sosLanguage to ensure it matches the interface language selected by the user
  const sosLanguage = welcomeTab;

  const renderPrivacyContent = () => {
    switch (privacyTab) {
      case 'ua':
        return (
          <div className="space-y-6 text-sm leading-relaxed animate-fade-in">
             <section>
                <h3 className="text-base font-bold text-slate-800 mb-2">1. Про сервіс</h3>
                <p>TriPsy — це помічник психологічної підтримки на базі штучного інтелекту Google Gemini. Він створений для надання первинної емоційної допомоги та активного слухання. <strong>Він не замінює професійну психотерапію або медичну консультацію.</strong></p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-800 mb-2">2. Конфіденційність та Анонімність</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Ваші розмови обробляються безпечно через API Google Generative AI.</li>
                  <li>TriPsy не зберігає вашу історію чату в базі даних. Сесія існує лише в локальній пам'яті вашого браузера, доки відкрито вікно.</li>
                  <li>Як тільки ви закриєте або оновите сторінку, історія розмови буде втрачена для забезпечення вашої приватності.</li>
                  <li>Ми рекомендуємо не повідомляти конкретну особисту інформацію (повні імена, адреси, документи) під час чату.</li>
                </ul>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-800 mb-2">3. Безпека та Надзвичайні ситуації</h3>
                <p>Якщо ви повідомите про безпосередню загрозу заподіяння шкоди собі чи іншим, TriPsy запрограмований надати пріоритет безпеці та надати інформацію про екстрені служби. Проте, як ШІ, він не може викликати служби порятунку за вас.</p>
              </section>
              
              <section className="bg-teal-50 p-4 rounded-xl border border-teal-100 text-teal-800">
                <h3 className="text-sm font-bold mb-1">Кризові ресурси</h3>
                <p>Якщо ви в небезпеці, будь ласка, негайно зателефонуйте до місцевої служби порятунку.</p>
              </section>
          </div>
        );
      case 'en':
      default:
        return (
           <div className="space-y-6 text-sm leading-relaxed animate-fade-in">
              <section>
                <h3 className="text-base font-bold text-slate-800 mb-2">1. Nature of Service</h3>
                <p>TriPsy is an AI-powered support assistant powered by Google's Gemini technology. It is designed to provide initial emotional support, active listening, and basic triage. <strong>It is not a substitute for professional mental health therapy or medical advice.</strong></p>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-800 mb-2">2. Data Privacy & Anonymity</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Your conversations are processed securely via Google's Generative AI API.</li>
                  <li>TriPsy does not store your personal chat history on a persistent database. Your session exists only in your browser's local memory while the window is open.</li>
                  <li>Once you close or refresh this page, the conversation history is lost to ensure your privacy.</li>
                  <li>Once you close or refresh this page, the conversation history is lost to ensure your privacy.</li>
                  <li>We recommend omitting specific personally identifiable information (full names, addresses, IDs) during chats.</li>
                </ul>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-800 mb-2">3. Safety & Emergencies</h3>
                <p>If you indicate immediate risk of harm to yourself or others, TriPsy is programmed to prioritize safety over confidentiality by providing emergency resource information. However, as an AI, it cannot call emergency services for you.</p>
              </section>
              
              <section className="bg-teal-50 p-4 rounded-xl border border-teal-100 text-teal-800">
                <h3 className="text-sm font-bold mb-1">Crisis Resources</h3>
                <p>If you are in danger, please call your local emergency number immediately.</p>
              </section>
            </div>
        );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-teal-50/50">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10 sticky top-0">
          <div 
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => window.location.reload()}
            title="Reload Chat"
          >
            <div className="bg-teal-100 p-2 rounded-xl">
              <HeartHandshake className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">TriPsy</h1>
              <p className="text-sm md:text-base text-slate-500 font-medium">{getHeaderSubtitle()}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Auto-Voice Toggle Button */}
            <button
              onClick={handleVoiceToggle}
              className={`p-2 rounded-full transition-all duration-200 border ${
                isAutoVoiceEnabled 
                  ? 'bg-teal-100 text-teal-700 border-teal-200 shadow-sm' 
                  : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'
              }`}
              title={isAutoVoiceEnabled ? "Turn Text-to-Speech OFF" : "Turn Text-to-Speech ON"}
              disabled={isLoadingAudio}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              ) : (
                isAutoVoiceEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />
              )}
            </button>

            {/* Only show info button in Expert Mode (or if needed for both, but request says clean UI for clients) */}
            {isExpertMode && (
              <button 
                className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-full"
                onClick={() => setShowMobileTriage(!showMobileTriage)}
              >
                <Info className="w-6 h-6" />
              </button>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth"
        >
          <div className="max-w-3xl mx-auto h-full">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-fade-in py-8">
                <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center shadow-sm mb-2">
                   <HeartHandshake className="w-10 h-10 text-teal-600" />
                </div>

                {/* Welcome Language Tabs */}
                <div className="flex p-1 bg-slate-200/60 rounded-xl mb-4">
                  <button 
                    onClick={() => setWelcomeTab('ua')}
                    className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
                      welcomeTab === 'ua' 
                        ? 'bg-white shadow-sm' 
                        : 'hover:bg-slate-100/50'
                    }`}
                    title="Українська"
                  >
                    <span className="text-lg">🇺🇦</span>
                  </button>
                  <button 
                    onClick={() => setWelcomeTab('en')}
                    className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
                      welcomeTab === 'en' 
                        ? 'bg-white shadow-sm' 
                        : 'hover:bg-slate-100/50'
                    }`}
                    title="English"
                  >
                    <span className="text-lg">🇬🇧</span>
                  </button>
                </div>
                
                <div className="space-y-3 max-w-xl min-h-[80px] flex flex-col justify-center">
                  {welcomeTab === 'ua' && (
                    <div className="space-y-2 animate-fade-in">
                      <p className="text-xl md:text-2xl font-bold text-slate-800">Вітаю! Мене звати TriPsy.</p>
                      <p className="text-lg md:text-xl text-slate-600 leading-relaxed">Я — ШІ-чат первинної психологічної підтримки. Поділіться зі мною своїми думками.</p>
                    </div>
                  )}

                  {welcomeTab === 'en' && (
                    <div className="space-y-2 animate-fade-in">
                      <p className="text-xl md:text-2xl font-bold text-slate-800">Hello! My name is TriPsy.</p>
                      <p className="text-lg md:text-xl text-slate-600 leading-relaxed">I am an AI initial psychological support chat. Share your thoughts with me.</p>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <button 
                    onClick={() => {
                      setPrivacyTab(welcomeTab);
                      setShowPrivacy(true);
                    }}
                    className="group text-sm font-medium text-slate-500 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm inline-flex items-center gap-2 hover:border-teal-300 hover:text-teal-700 hover:shadow-md transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-teal-500 group-hover:text-teal-600" />
                    <span>{getConfidentialityText()}</span>
                  </button>
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <ChatMessage key={msg.id} message={msg} language={welcomeTab} />
              ))
            )}
            {isLoading && (
              <div className="flex justify-start mb-6 pl-12">
                <div className="bg-slate-100 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                   <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div className="h-4" /> {/* Spacer */}
          </div>
        </div>

        {/* Input Area */}
        <ChatInput 
          onSend={handleSendMessage} 
          isLoading={isLoading} 
          language={welcomeTab} 
          showSos={showSos} 
          sosLanguage={sosLanguage} 
        />
      </div>

      {/* Desktop Triage Sidebar - Expert Mode Only */}
      {isExpertMode && (
        <div className="hidden lg:block w-80 xl:w-96 p-4 border-l border-slate-200 bg-white/50 backdrop-blur-sm h-full overflow-hidden">
          <TriagePanel data={latestTriage} />
        </div>
      )}

      {/* Mobile Triage Overlay - Expert Mode Only */}
      {showMobileTriage && isExpertMode && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowMobileTriage(false)}
          />
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Analysis Dashboard</h2>
              <button 
                onClick={() => setShowMobileTriage(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-slate-50">
               <TriagePanel data={latestTriage} />
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowPrivacy(false)} />
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col animate-fade-in-up z-10">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 rounded-t-2xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-teal-600"/> 
                {privacyTab === 'ua' ? 'Політика конфіденційності' : 'Privacy Policy'}
              </h2>
              
              {/* Tabs */}
              <div className="flex p-1 bg-slate-200/60 rounded-lg">
                <button 
                  onClick={() => setPrivacyTab('ua')}
                  className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-2 ${
                    privacyTab === 'ua' 
                      ? 'bg-white shadow-sm' 
                      : 'hover:bg-slate-100/50'
                  }`}
                >
                  <span className="text-lg">🇺🇦</span>
                </button>
                <button 
                  onClick={() => setPrivacyTab('en')}
                  className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-2 ${
                    privacyTab === 'en' 
                      ? 'bg-white shadow-sm' 
                      : 'hover:bg-slate-100/50'
                  }`}
                >
                  <span className="text-lg">🇬🇧</span>
                </button>
              </div>

              <button 
                onClick={() => setShowPrivacy(false)} 
                className="absolute right-4 top-4 sm:static p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto text-slate-600">
              {renderPrivacyContent()}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end">
              <button 
                onClick={() => setShowPrivacy(false)} 
                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-medium transition-all shadow-sm hover:shadow"
              >
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