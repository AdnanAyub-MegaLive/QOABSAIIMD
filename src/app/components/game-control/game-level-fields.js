export default function GameLevelFields({game,onChange,disabled=false}) {
  const view=game.minViewLevel ?? 0;
  const play=game.minPlayLevel ?? view;
  return <fieldset disabled={disabled} className="form-grid"><legend>User level access</legend>
    <label>Minimum level to view<input type="number" min="0" step="1" required value={view}
      onChange={event=>{const level=Number(event.target.value);onChange({minViewLevel:level,minPlayLevel:Math.max(level,play)});}}/></label>
    <label>Minimum level to play<input type="number" min={view} step="1" required value={play}
      onChange={event=>onChange({minPlayLevel:Number(event.target.value)})}/></label>
    <p>Users between the two levels can preview. Resellers can only preview.</p>
  </fieldset>;
}
