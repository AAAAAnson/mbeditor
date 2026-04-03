interface EditorTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

export default function EditorTabs({ activeTab, onTabChange, tabs }: EditorTabsProps) {
  return (
    <div className="flex border-b border-border bg-surface-secondary">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? "text-accent border-b-2 border-accent"
              : "text-fg-muted hover:text-fg-secondary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
