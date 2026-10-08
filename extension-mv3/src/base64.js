// Binary data crosses extension messaging as base64 strings (messages are JSON-serialised).

export function bytesToBase64(bytes) {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
	}
	return btoa(binary);
}

export function base64ToBytes(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}
