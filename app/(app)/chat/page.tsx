import { ChatCapture } from '@/components/chat-capture';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata = { title: 'Chat · Hamza Assistant' };

export default function ChatPage() {
  return (
    <>
      <p className="eyebrow">Chat</p>
      <h1 className="h1 mt-1">Screenshot to reply</h1>
      <p className="mt-2 text-[14px] muted">
        Upload a screenshot from Instagram, WhatsApp, Fiverr, email or anywhere else. I read who it
        is and what they said, save it to the right client, and write your reply ready to copy.
      </p>
      <div className="mt-4">
        <ChatCapture />
      </div>
    </>
  );
}
