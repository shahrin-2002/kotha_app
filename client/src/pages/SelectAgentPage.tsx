interface Agent {
  id: string;
  name: string;
  phone?: string;
  location?: string;
}

interface Props {
  agents: Agent[];
  promptText: string;
  onSelect: (name: string) => void;
}

export function SelectAgentPage({ agents, promptText, onSelect }: Props) {
  return (
    <div className="page">
      <p className="prompt-text">{promptText}</p>
      <div className="recipient-grid">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className="recipient-tile"
            onClick={() => onSelect(agent.name)}
          >
            <div className="avatar">🏪</div>
            <span className="name">{agent.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
