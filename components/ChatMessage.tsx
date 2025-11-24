import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types';
import { User, Bot } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  language?: 'ua' | 'en';
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, language = 'ua' }) => {
  const isUser = message.role === 'user';

  // Clean the text to ensure no JSON blocks appear in the client UI
  const cleanText = isUser ? message.text : message.text.replace(/```json[\s\S]*?```/g, '').trim();

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6 animate-fade-in-up`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
          isUser ? 'bg-indigo-600 text-white' : 'bg-teal-600 text-white'
        }`}>
          {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>

        {/* Bubble Container */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          
          {/* Message Text */}
          <div className={`px-5 py-3.5 rounded-2xl shadow-sm text-base md:text-lg leading-relaxed ${
            isUser 
              ? 'bg-indigo-600 text-white rounded-tr-none' 
              : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
          }`}>
            <ReactMarkdown 
              components={{
                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc ml-4 mb-2" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                li: ({node, ...props}) => <li className="mb-1" {...props} />,
                strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
              }}
            >
              {cleanText}
            </ReactMarkdown>
          </div>

          {/* Timestamp */}
          <span className="text-[10px] text-slate-400 mt-1 px-1">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;