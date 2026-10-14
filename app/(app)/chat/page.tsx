import { ChatCapture } from '@/components/chat-capture';
import { PageHeading } from '@/components/page-heading';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata = { title: 'Chat · Hamza Assistant' };

export default function ChatPage() {
  return (
    <>
      <PageHeading
        eyebrow="Chat capture"
        title="Reply from screenshots"
        description="Upload up to 10 screenshots. I will combine the conversation, save it to the right client, and draft one reply."
      />
      <ChatCapture />
    </>
  );
}
