"use client";

import { useCallback } from "react";

type ShareActionsProps = {
  url: string;
  title: string;
};

export default function ShareActions({ url, title }: ShareActionsProps) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const handleShareX = useCallback(() => {
    const shareUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }, [encodedTitle, encodedUrl]);

  const handleShareLine = useCallback(() => {
    const shareUrl = `https://line.me/R/msg/text/?${encodedTitle}%0A${encodedUrl}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }, [encodedTitle, encodedUrl]);

  const handleCopyLink = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert("リンクをコピーしました。");
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      alert("リンクをコピーしました。");
    }
  }, [url]);

  return (
    <div className="share-buttons">
      <button className="share-btn" type="button" onClick={handleShareX}>
        Xでシェア
      </button>
      <button className="share-btn" type="button" onClick={handleShareLine}>
        LINEで送る
      </button>
      <button className="share-btn" type="button" onClick={handleCopyLink}>
        リンクをコピー
      </button>
    </div>
  );
}
