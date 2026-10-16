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
        description="Upload up to 10 ordered screenshots. I will continue the matching client thread, add only new messages, and save one unsent reply draft. Nothing is sent."
      />
      <ChatCapture />
    </>
  );
}
