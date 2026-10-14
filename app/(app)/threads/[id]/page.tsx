import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageComposer } from '@/components/message-composer';
import { PageHeading } from '@/components/page-heading';
import { ReplyPanel } from '@/components/reply-panel';
import { getThread } from '@/lib/data/threads';
import { CHANNEL_LABELS, STAGE_LABELS } from '@/lib/domain';

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
      <Link className="page-back-link" href={client ? `/clients/${client.id}` : '/clients'}>
        {client ? `Back to ${client.name}` : 'Back to clients'}
      </Link>

      <PageHeading
        eyebrow={MODE_LABELS[thread.mode] ?? thread.mode}
        title={thread.title}
        description={client
          ? `${client.name}${client.company ? ` · ${client.company}` : ''} · ${STAGE_LABELS[client.stage as keyof typeof STAGE_LABELS] ?? client.stage}`
          : 'No client linked'}
      />

      {/* The panel sits above the conversation: on a phone the draft is the
          point of opening a thread, and the history is one scroll away. The
          client's last message is quoted inside the panel, so the context is
          visible without scrolling at all. */}
      <ReplyPanel
        defaultChannel={client?.channel ?? 'instagram'}
        lastClientMessage={lastFromClient}
        threadId={thread.id}
      />

      {/* The history reads like the chat screen: the client on the left in
          grey, what you sent on the right in blue, your private notes in
          gold. The side and the colour say who spoke, so no role tags. */}
      <section className="mt-5 space-y-3" aria-label="Thread history">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3">
            <p className="text-[13px] font-medium text-ink-soft">No messages saved yet</p>
            <p className="mt-0.5 text-[12px] muted">
              A pasted client message is added to history when you save the reply you send.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const files = attachmentsByMessage.get(message.id) ?? [];
            const isNote = message.role === 'note';
            const onLeft = message.role === 'client' || isNote;
            const bubble = isNote
              ? 'rounded-2xl rounded-bl-md border border-dashed border-gold-line bg-gold-soft text-ink'
              : onLeft
                ? 'rounded-2xl rounded-bl-md bg-line text-ink'
                : 'rounded-2xl rounded-br-md bg-brand text-white';
            const channelLabel = message.channel
              ? (CHANNEL_LABELS[message.channel as keyof typeof CHANNEL_LABELS] ?? message.channel)
              : null;

            return (
              <div
                key={message.id}
                className={`flex flex-col ${onLeft ? 'items-start' : 'items-end'}`}
              >
                {isNote && (
                  <span className="mb-0.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-gold">
                    Note
                  </span>
                )}

                <div className={`max-w-[85%] px-4 py-2.5 ${bubble}`}>
                  <p className="whitespace-pre-wrap break-words text-[14px]">{message.content}</p>
                </div>

                {files.length > 0 && (
                  <ul className="mt-1.5 max-w-[85%] space-y-2">
                    {files.map((file) => (
                      <li key={file.id} className="rounded-xl border border-line bg-surface p-2">
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

                <span className="mt-0.5 px-1 text-[11px] text-ink-faint">
                  {formatWhen(message.sent_at ?? new Date().toISOString())}
                  {channelLabel ? ` · ${channelLabel}` : ''}
                </span>
              </div>
            );
          })
        )}
      </section>

      <MessageComposer threadId={thread.id} clientId={thread.client_id} defaultRole="client" />
    </>
  );
}
