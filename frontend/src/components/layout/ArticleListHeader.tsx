import { Link } from "react-router-dom";
import { Search, Plus } from "lucide-react";

interface ArticleListHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateNew: () => void;
}

const tabs = ["全部文章", "草稿", "已发布", "回收站"];

export default function ArticleListHeader({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onCreateNew,
}: ArticleListHeaderProps) {
  return (
    <header className="h-14 bg-surface-secondary border-b border-border-primary px-6 flex items-center shrink-0 relative">
      {/* Left: Logo */}
      <Link
        to="/"
        className="text-fg-primary font-bold text-[18px] tracking-tight shrink-0"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        MBEditor
      </Link>

      {/* Center: Nav tabs — absolute center */}
      <nav className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`text-sm transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "text-accent font-medium"
                : "text-fg-muted hover:text-fg-secondary"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Right: Search + New + Avatar */}
      <div className="flex items-center gap-2.5 ml-auto">
        {/* Search input */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索文章..."
            className="w-[200px] h-8 bg-surface-secondary border border-border-secondary rounded-lg pl-8 pr-3 text-xs text-fg-primary placeholder:text-fg-muted outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* New article button */}
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1.5 bg-accent text-white rounded-lg py-[7px] px-4 shadow-glow hover:brightness-110 transition-all"
        >
          <Plus size={14} />
          <span className="text-[13px] font-medium">新建文章</span>
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full shrink-0"
          style={{
            background: "linear-gradient(135deg, #E8553A, #C9923E)",
          }}
        />
      </div>
    </header>
  );
}
