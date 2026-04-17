import { useState, useEffect, useRef } from "react";
import { Upload, Copy, Trash2, Plus } from "lucide-react";
import api from "@/lib/api";
import { useImageUpload } from "@/hooks/useImageUpload";
import type { ImageRecord } from "@/types";

interface ImageManagerProps {
  onInsert: (url: string) => void;
}

export default function ImageManager({ onInsert }: ImageManagerProps) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const { upload } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.get("/images").then((res) => {
      if (res.data.code === 0) setImages(res.data.data);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await upload(file);
    }
    load();
    e.target.value = "";
  };

  const copyUrl = (path: string) => {
    navigator.clipboard.writeText(`/images/${path}`);
  };

  const deleteImage = async (id: string) => {
    await api.delete(`/images/${id}`);
    load();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={handleUpload}
          aria-label="上传图片"
          title="上传图片"
          className="rounded p-1 text-fg-muted hover:bg-surface-tertiary hover:text-fg-primary"
        >
          <Upload size={14} />
        </button>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {images.map((img) => (
          <div
            key={img.id}
            className="group flex items-center gap-2 rounded-lg p-1.5 text-xs hover:bg-surface-tertiary"
          >
            <img
              src={`/images/${img.path}`}
              className="h-8 w-8 rounded bg-surface-tertiary object-cover"
              alt=""
            />
            <span className="flex-1 truncate text-fg-secondary">{img.filename}</span>
            <button
              onClick={() => onInsert(`/images/${img.path}`)}
              aria-label="插入到光标位置"
              title="插入到光标位置"
              className="p-1 opacity-0 group-hover:opacity-100 hover:text-accent"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => copyUrl(img.path)}
              aria-label="复制图片链接"
              title="复制图片链接"
              className="p-1 opacity-0 group-hover:opacity-100 hover:text-accent"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={() => deleteImage(img.id)}
              aria-label="删除图片"
              title="删除图片"
              className="p-1 opacity-0 group-hover:opacity-100 hover:text-error"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />
    </div>
  );
}
