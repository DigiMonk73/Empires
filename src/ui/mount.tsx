import { render } from 'preact';
import { Hud } from './hud/Hud.tsx';
import './hud/hud.css';

export function mountHud(el: HTMLElement): void {
  render(<Hud />, el);
}
