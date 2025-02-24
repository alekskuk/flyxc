import '../dashboard-element';
import '../menu-element';
import '../name-element';
import './tracking3d-element';

import * as common from '@flyxc/common';
import { css, CSSResult, html, LitElement, TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';
import { connect } from 'pwa-helpers';

import * as units from '../../logic/units';
import * as sel from '../../redux/selectors';
import { RootState, store } from '../../redux/store';

@customElement('controls3d-element')
export class Controls3dElement extends connect(store)(LitElement) {
  @state()
  private timeSec = 0;
  @state()
  private track?: common.RuntimeTrack;
  @state()
  private units?: units.Units;
  @state()
  private color = '';

  stateChanged(state: RootState): void {
    this.timeSec = state.app.timeSec;
    this.track = sel.currentTrack(state);
    this.units = state.units;
    this.color = sel.trackColors(state)[this.track?.id ?? 0];
  }

  static get styles(): CSSResult {
    return css`
      :host {
        display: block;
        font: 12px 'Nobile', verdana, sans-serif;
        height: 1px;
        box-shadow: none !important;
      }
    `;
  }

  protected render(): TemplateResult {
    return html`
      <menu-ctrl-element></menu-ctrl-element>
      <tracking3d-element></tracking3d-element>
      ${when(
        this.track?.name,
        () =>
          html`
            <name-ctrl-element .name=${this.track?.name} .color=${this.color} .track=${this.track}></name-ctrl-element>
          `,
      )}
      ${when(
        this.track,
        () =>
          html`
            <dashboard-ctrl-element
              .track=${this.track}
              .timeSec=${this.timeSec}
              .units=${this.units}
            ></dashboard-ctrl-element>
          `,
      )}
    `;
  }
}
