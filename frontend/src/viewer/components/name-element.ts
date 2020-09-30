import { CSSResult, customElement, html, LitElement, property, TemplateResult } from 'lit-element';

import { trackColor } from '../logic/tracks';
import { controlStyle } from './control-style';

@customElement('name-ctrl-element')
export class NameElement extends LitElement {
  @property()
  name?: string;

  @property()
  index?: number;

  @property()
  displayNames = false;

  @property()
  // Total number of tracks.
  // Display a "next" button when multiple tracks are loaded.
  nbtracks = 0;

  static get styles(): CSSResult {
    return controlStyle;
  }

  protected render(): TemplateResult {
    return html`
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/line-awesome@1/dist/line-awesome/css/line-awesome.min.css"
      />
      <label
        ><input type="checkbox" ?checked=${this.displayNames} @change=${this.handleDisplayNames} /><i
          class="la la-user-tag la-2x"
          style=${`color: ${trackColor(this.index || 0)};`}
        ></i
      ></label>
      ${this.name}
      ${this.nbtracks > 1
        ? html`<i class="la la-chevron-right la-2x" style="cursor: pointer" @click=${this.handleNext}></i>`
        : html``}
      <i class="la la-times-circle la-2x" style="cursor: pointer" @click=${this.handleClose}></i>
    `;
  }

  private handleClose(): void {
    this.dispatchEvent(new CustomEvent('closeActiveTrack'));
  }

  private handleNext(): void {
    this.dispatchEvent(new CustomEvent('selectNextTrack'));
  }

  private handleDisplayNames(e: Event): void {
    const show = (e.target as HTMLInputElement).checked;
    this.dispatchEvent(new CustomEvent('displayNames', { detail: show }));
  }
}
