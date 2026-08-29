interface IconTileProps {
  icon: string;
  label: string;
  onClick: () => void;
}

export function IconTile({ icon, label, onClick }: IconTileProps) {
  return (
    <button className="icon-tile" onClick={onClick}>
      <span className="tile-icon">{icon}</span>
      <span className="tile-label">{label}</span>
    </button>
  );
}
