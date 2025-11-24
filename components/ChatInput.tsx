import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Mic, Phone, Heart } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  language: 'ua' | 'en';
  showSos: boolean;
  sosLanguage: 'ua' | 'en';
}

const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading, language, showSos, sosLanguage }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const getPlaceholder = () => {
    switch (language) {
      case 'en':
        return "Share your thoughts...";
      case 'ua':
      default:
        return "Поділіться думками...";
    }
  };

  const getSosLabel = () => {
    switch (sosLanguage) {
      case 'en':
        return "HELP! CALL FOR HELP";
      case 'ua':
      default:
        return "HELP! ЗАТЕЛЕФОНУВАТИ";
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [input]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    // Strict Requirement: Always listen in Ukrainian regardless of UI language
    recognition.lang = 'uk-UA';
    
    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => {
        const separator = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
        return prev + separator + transcript;
      });
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="bg-white p-3 md:p-4 border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 relative">
      <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto flex items-end gap-2">
        <div className="relative flex-1 bg-slate-50 rounded-2xl border border-slate-200 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            className="w-full bg-transparent pl-4 pr-12 py-3 text-base md:text-lg text-slate-700 placeholder-slate-400 focus:outline-none resize-none min-h-[48px] max-h-[120px] overflow-y-auto rounded-2xl"
            rows={1}
            disabled={isLoading}
          />
          
          {/* Voice Input Button */}
          <button
            type="button"
            onClick={toggleListening}
            className={`absolute right-2 bottom-2 p-2 rounded-xl transition-all duration-300 ${
              isListening
                ? 'bg-green-100 text-green-600 animate-pulse ring-1 ring-green-200'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            }`}
            disabled={isLoading}
            title="Voice Input (UA)"
          >
            {/* Always show Mic icon, never Crossed Mic */}
            <Mic className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>
        
        {/* SOS Button */}
        {showSos && (
           <a 
           href="tel:0800500335"
           className="flex-shrink-0 w-[48px] h-[48px] flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
           title={getSosLabel()}
         >
           <div className="relative flex items-center justify-center">
             <Heart className="w-12 h-12 text-red-600 fill-red-600 animate-pulse drop-shadow-lg" />
             <Phone className="w-5 h-5 text-white absolute z-10" />
           </div>
         </a>
        )}

        {/* Send Button */}
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={`h-[48px] w-[48px] flex items-center justify-center rounded-xl flex-shrink-0 transition-all duration-200 ${
            !input.trim() || isLoading
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-teal-600 text-white hover:bg-teal-700 shadow-md'
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>
    </div>
  );
};

export default ChatInput;