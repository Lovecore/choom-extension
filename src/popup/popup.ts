import { BUILD_VERSION, RELAY_URL } from '../shared/config';
import { readSettings, SETTINGS_KEY, type ViewerSettings } from '../shared/messages';

/** The toolbar popup: the viewer's two settings, kept in chrome.storage.local. */
const show = document.getElementById('show') as HTMLInputElement;
const hover = document.getElementById('hover') as HTMLInputElement;
const extra = document.getElementById('extra') as HTMLSelectElement;
let settings: ViewerSettings = readSettings(null);

async function load() {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  settings = readSettings(got[SETTINGS_KEY]);
  show.checked = settings.show;
  hover.checked = settings.hover;
  extra.value = String(settings.extraMs);
  if (extra.value === '') extra.value = '0';
}
const save = () => chrome.storage.local.set({ [SETTINGS_KEY]: settings });

show.addEventListener('change', () => {
  settings = { ...settings, show: show.checked };
  void save();
});
hover.addEventListener('change', () => {
  settings = { ...settings, hover: hover.checked };
  void save();
});
extra.addEventListener('change', () => {
  settings = { ...settings, extraMs: Number(extra.value) };
  void save();
});
(document.getElementById('foot') as HTMLElement).textContent = `v${BUILD_VERSION} · ${new URL(RELAY_URL).host}`;
void load();
