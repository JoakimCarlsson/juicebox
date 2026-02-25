/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

let _enabled = false;
let _active = true;
let _counter = 0;

function generateId(): string {
  return `clip-${Date.now()}-${++_counter}`;
}

function getCallerStack(): string {
  try {
    const Thread = Java.use("java.lang.Thread");
    const frames = Thread.currentThread().getStackTrace();
    const lines: string[] = [];
    const start = Math.min(3, frames.length);
    const end = Math.min(start + 4, frames.length);
    for (let i = start; i < end; i++) {
      lines.push(frames[i].toString());
    }
    return lines.join("\n");
  } catch (_) {
    return "";
  }
}

function extractClipText(
  clipData: any,
): { content: string | null; mimeType: string | null } {
  try {
    if (clipData === null || clipData === undefined) {
      return { content: null, mimeType: null };
    }
    const count = clipData.getItemCount();
    if (count === 0) return { content: null, mimeType: null };

    let mimeType: string | null = null;
    const desc = clipData.getDescription();
    if (desc !== null && desc.getMimeTypeCount() > 0) {
      mimeType = String(desc.getMimeType(0));
    }

    const item = clipData.getItemAt(0);
    const text = item.getText();
    if (text !== null) {
      return { content: String(text), mimeType: mimeType ?? "text/plain" };
    }

    const uri = item.getUri();
    if (uri !== null) {
      return {
        content: String(uri.toString()),
        mimeType: mimeType ?? "text/uri-list",
      };
    }

    return { content: null, mimeType };
  } catch (_) {
    return { content: null, mimeType: null };
  }
}

function enable(): { enabled: boolean } {
  if (_enabled) {
    _active = true;
    return { enabled: true };
  }

  if (!Java.available) return { enabled: false };

  Java.perform(() => {
    try {
      const ClipboardManager = Java.use("android.content.ClipboardManager");

      ClipboardManager.getPrimaryClip.implementation = function () {
        const clip = this.getPrimaryClip();
        if (_active) {
          const { content, mimeType } = extractClipText(clip);
          send({
            type: "clipboard",
            payload: {
              id: generateId(),
              direction: "read",
              content,
              mimeType,
              callerStack: getCallerStack(),
              timestamp: Date.now(),
            },
          });
        }
        return clip;
      };

      ClipboardManager.setPrimaryClip.overload("android.content.ClipData")
        .implementation = function (clip: any) {
          if (_active) {
            const { content, mimeType } = extractClipText(clip);
            send({
              type: "clipboard",
              payload: {
                id: generateId(),
                direction: "write",
                content,
                mimeType,
                callerStack: getCallerStack(),
                timestamp: Date.now(),
              },
            });
          }
          return this.setPrimaryClip(clip);
        };
    } catch (_) {}
  });

  _enabled = true;
  _active = true;
  return { enabled: true };
}

function disable(): { disabled: boolean } {
  _active = false;
  return { disabled: true };
}

const clipboard: AgentModule = { enable, disable };
export default clipboard;
