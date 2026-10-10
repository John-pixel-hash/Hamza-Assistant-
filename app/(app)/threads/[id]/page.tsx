import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageComposer } from '@/components/message-composer';
import { ReplyPanel } from '@/components/reply-panel';
import { RoleTag } from '@/components/ui';
import { getThread } from '@/lib/data/threads';
import { CHANNEL_LABELS, ROLE_LABELS, STAGE_LABELS } from '@/lib/domain';

export const metadata: Metadata = { title: 'Thread' };
export const dynamic = 'force-dynamic';

/**
 * The draft action can take six to thirty seconds. Vercel's free plan kills
 * functions past ten unless the segment declares more, and sixty is the
 * ceiling it allows. The layout sets the same value; this page is where the
 * slow action is called, so it states it too.
 */
export const maxDuration = 60;

const MODE_LABELS: Record<string, string> = {
  client_reply: 'Client conversation',
  project: 'Project work',
  internal: 'Internal only',
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getThread(id);
  if (!detail) notFound();

  const { thread, client, messages, attachments } = detail;
  const lastFromClient =
    [...messages].reverse().find((message) => message.role === 'client')?.content ?? null;
  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    if (!attachment.message_id) continue;
    const list = attachmentsByMessage.get(attachment.message_id) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.message_id, list);
  }

  return (
    <>
      <Link
        className="text-[13px] font-medium text-brand"
        href={client ? `/clients/${client.id}` : '/clients'}
      >
        {client ? `Back to ${client.name}` : 'Back to clients'}
      </Link>

      <header className="card mt-3 p-4">
        <p className="eyebrow">{MODE_LABELS[thread.mode] ?? thread.mode}</p>
        <h1 className="h1 mt-1">{thread.title}</h1>
        <p className="mt-1 text-[13px] muted">
          {client ? (
            <>
              {client.name}
              {client.company ? ` · ${client.company}` : ''} ·{' '}
              {STAGE_LABELS[client.stage as keyof typeof STAGE_LABELS] ?? client.stage}
            </>
          ) : (
            'No client linked'
          )}
        </p>
      </header>

      {/* The panel sits above the conversation: on a phone the draft is the
          point of opening a thread, and the history is one scroll away. The
          client's last message is quoted inside the panel, so the context is
          visible without scrolling at all. */}
      <ReplyPanel
        defaultChannel={client?.channel ?? 'instagram'}
        lastClientMessage={lastFromClient}
        threadId={thread.id}
      />

      <section className="mt-5 space-y-3">
        {messages.length === 0 ? (
          <div className="card p-5">
            <p className="font-medium">Empty thread</p>
            <p className="mt-1 text-[14px] muted">
              Paste the client message below, or upload a screenshot of it. Then save it to history.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const files = attachmentsByMessage.get(message.id) ?? [];
            return (
              <article
                key={message.id}
                className={`rounded-[14px] p-4 ${
                  message.role === 'client'
                    ? 'bubble-client'
                    : message.role === 'note'
                      ? 'bubble-note'
                      : 'bubble-me'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
                  <RoleTag role={message.role} label={ROLE_LABELS[message.role] ?? message.role} />
                  <span>{formatWhen(message.sent_at ?? message.sent_at ?? new Date().toISOString())}</span>
                  {message.channel && (
                    <span>{CHANNEL_LABELS[message.channel as keyof typeof CHANNEL_LABELS] ?? message.channel}</span>
                  )}
                </div>

                <p className="whitespace-pre-wrap break-words text-[14px]">{message.content}</p>

                {files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {files.map((file) => (
                      <li key={file.id} className="rounded-lg border border-line bg-surface p-2">
                        {file.kind === 'image' && file.url ? (
                          // Signed URLs expire, so the image is fetched fresh each view.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={file.url}
                            alt={file.original_name ?? 'Client screenshot'}
                            className="max-h-72 w-full rounded object-contain"
                          />
                        ) : (
                          <div className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="truncate">{file.original_name ?? 'Attachment'}</span>
                            {file.url ? (
                              <a className="font-medium text-brand" href={file.url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            ) : (
                              <span className="text-ink-faint">link unavailable</span>
                            )}
                          </div>
                        )}
                        {file.extracted_text && (
                          <p className="mt-2 whitespace-pre-wrap border-t border-line pt-2 text-[13px] text-ink-soft">
                            {file.extracted_text}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })
        )}
      </section>

      <section className="mt-5">
        <MessageComposer threadId={thread.id} clientId={thread.client_id} defaultRole="client" />
      </section>
    </>
  );
}
