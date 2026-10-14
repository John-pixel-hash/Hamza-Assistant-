import { ChatCapture } from '@/components/chat-capture';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata = { title: 'Chat · Hamza Assistant' };

export default function ChatPage() {
  return (
    <>
      <p className="eyebrow">Chat</p>
      <h1 className="h1 mt-1">Screenshots to reply</h1>
      <p className="mt-2 text-[14px] muted">
        Upload up to 10 screenshots from Instagram, WhatsApp, Fiverr, email or anywhere else. I read
        them together, save the conversation to the right client, and write one reply ready to copy.
      </p>
      <div className="mt-4">
        <ChatCapture />
      </div>
    </>
  );
}
