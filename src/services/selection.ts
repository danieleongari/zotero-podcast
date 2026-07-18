import type { SelectionPreview, SourceDocument } from "../types";

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/epub+zip",
  "text/html",
  "application/xhtml+xml",
]);

function displayTitle(item: Zotero.Item): string {
  return String(item.getField("title") || item.attachmentFilename || `Item ${item.key}`);
}

function attachmentIdentity(item: Zotero.Item): string {
  return `${item.libraryID}/${item.key}`;
}

function isSupportedAttachment(item: Zotero.Item): boolean {
  if (!item.isAttachment() || !item.isFileAttachment()) return false;
  const contentType = item.attachmentContentType || "";
  const fullText = (Zotero as any).FullText || (Zotero as any).Fulltext;
  return SUPPORTED_MIME_TYPES.has(contentType) || Boolean(fullText?.isCachedMIMEType(contentType));
}

async function attachmentItemsForItems(items: Zotero.Item[]): Promise<{
  attachments: Zotero.Item[];
  skipped: string[];
}> {
  const attachments = new Map<string, Zotero.Item>();
  const skipped: string[] = [];

  for (const item of items) {
    if (item.isRegularItem()) {
      const childIDs = item.getAttachments(false);
      const children = childIDs.length
        ? ((await Zotero.Items.getAsync(childIDs)) as Zotero.Item[])
        : [];
      const supported = children.filter(isSupportedAttachment);
      for (const attachment of supported) {
        attachments.set(attachmentIdentity(attachment), attachment);
      }
      if (!supported.length) {
        skipped.push(`${displayTitle(item)} — no supported full-text attachments`);
      }
      for (const attachment of children.filter((child) => !isSupportedAttachment(child))) {
        skipped.push(
          `${displayTitle(attachment)} — unsupported attachment type ${attachment.attachmentContentType || "unknown"}`,
        );
      }
    } else if (isSupportedAttachment(item)) {
      attachments.set(attachmentIdentity(item), item);
    } else {
      skipped.push(`${displayTitle(item)} — not a supported file attachment`);
    }
  }
  return { attachments: [...attachments.values()], skipped };
}

async function collectionItemsRecursive(collection: Zotero.Collection): Promise<Zotero.Item[]> {
  const items = new Map<string, Zotero.Item>();
  const visit = async (current: Zotero.Collection) => {
    for (const item of current.getChildItems(false, false)) {
      items.set(`${item.libraryID}/${item.key}`, item);
    }
    for (const child of current.getChildCollections(false, false)) {
      await visit(child);
    }
  };
  await visit(collection);
  return [...items.values()];
}

function creatorLine(parent: Zotero.Item | undefined): string | undefined {
  if (!parent) return undefined;
  const creators = parent.getCreators();
  const names = creators
    .map((creator) => {
      const first = String((creator as any).firstName || "").trim();
      const last = String((creator as any).lastName || "").trim();
      return `${first} ${last}`.trim();
    })
    .filter(Boolean);
  return names.length ? names.join(", ") : undefined;
}

async function extractAttachment(
  attachment: Zotero.Item,
  sourceID: string,
): Promise<SourceDocument> {
  const fullText = (Zotero as any).FullText || (Zotero as any).Fulltext;
  await fullText.indexItems([attachment.id], { complete: true, ignoreErrors: false });
  const cacheFile = fullText.getItemCacheFile(attachment);
  if (!cacheFile?.exists()) {
    throw new Error("full-text cache was not created");
  }
  const text = String(await Zotero.File.getContentsAsync(cacheFile)).trim();
  if (!text) throw new Error("extracted text is empty");

  const parentID = attachment.parentItemID;
  const parent = parentID ? Zotero.Items.get(parentID) : undefined;
  const date = parent ? String(parent.getField("date") || "") : "";
  const year = date.match(/\b(?:19|20)\d{2}\b/)?.[0];

  return {
    sourceID,
    attachmentID: attachment.id,
    attachmentKey: attachment.key,
    libraryID: attachment.libraryID,
    title: displayTitle(attachment),
    parentTitle: parent ? displayTitle(parent) : undefined,
    creators: creatorLine(parent),
    year,
    contentType: attachment.attachmentContentType || "unknown",
    text,
    textCharacters: text.length,
  };
}

export class SelectionService {
  async fromItems(items: Zotero.Item[]): Promise<SelectionPreview> {
    const resolved = await attachmentItemsForItems(items);
    return this.extract(resolved.attachments, resolved.skipped);
  }

  async fromCollection(collection: Zotero.Collection): Promise<SelectionPreview> {
    const items = await collectionItemsRecursive(collection);
    const resolved = await attachmentItemsForItems(items);
    return this.extract(resolved.attachments, resolved.skipped);
  }

  private async extract(attachments: Zotero.Item[], skipped: string[]): Promise<SelectionPreview> {
    const sources: SourceDocument[] = [];
    for (const attachment of attachments) {
      const sourceID = `[D${sources.length + 1}]`;
      try {
        sources.push(await extractAttachment(attachment, sourceID));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skipped.push(`${displayTitle(attachment)} — ${message}`);
      }
    }
    return { sources, skipped };
  }

  supportsAny(items: Zotero.Item[] | undefined): boolean {
    return Boolean(
      items?.some(
        (item) => item.isRegularItem() || (item.isAttachment() && isSupportedAttachment(item)),
      ),
    );
  }
}
