// The keyboard shortcuts as Chrome has them now (the user can change them at chrome://extensions/shortcuts),
// split into keys for display: "Ctrl+Shift+Y" → ["Ctrl", "Shift", "Y"], "⇧⌘Y" → ["⇧", "⌘", "Y"].
export async function getShortcuts() {
	const commands = await chrome.commands.getAll();
	const keys = name => {
		const shortcut = (commands.find(command => command.name == name) || {}).shortcut || "";
		return shortcut.includes("+") ? shortcut.split("+") : Array.from(shortcut);
	};
	return { save: keys("save-page"), print: keys("print-page") };
}

export function renderKeys(keys) {
	const fragment = document.createDocumentFragment();
	keys.forEach(key => {
		const kbd = document.createElement("kbd");
		kbd.textContent = key;
		fragment.append(kbd);
	});
	return fragment;
}

export function openShortcutSettings() {
	chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}
