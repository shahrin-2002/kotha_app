import { IconTile } from "../components/IconTile";

interface HomePageProps {
  onTaskSelect: (taskType: string) => void;
  promptText: string;
}

export function HomePage({ onTaskSelect, promptText }: HomePageProps) {
  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="tile-grid">
        <IconTile
          icon="💸"
          label="টাকা পাঠান"
          onClick={() => onTaskSelect("send_money")}
        />
        <IconTile
          icon="🏧"
          label="ক্যাশ আউট"
          onClick={() => onTaskSelect("cash_out")}
        />
        <IconTile
          icon="📱"
          label="রিচার্জ"
          onClick={() => onTaskSelect("recharge")}
        />
        <IconTile
          icon="💰"
          label="ব্যালেন্স"
          onClick={() => onTaskSelect("check_balance")}
        />
      </div>
    </div>
  );
}
