import { expect, it, vi } from 'vitest';
import { saveInAndroidShell } from '../../lib/save-target';

const file = () => new File([new Uint8Array([80, 75, 3, 4])], 'Brief: an/alle?.docx');

it('writes into Documents/Familienbuero through the Capacitor filesystem module', async () => {
  const writeFile = vi.fn().mockResolvedValue({ uri: 'file:///x' });
  const scope = { Capacitor: { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile } } } };
  await expect(saveInAndroidShell(file(), scope)).resolves.toBe('Dokumente/Familienbuero/Brief_ an_alle_.docx');
  expect(writeFile).toHaveBeenCalledWith({
    path: 'Familienbuero/Brief_ an_alle_.docx',
    data: 'UEsDBA==',
    directory: 'DOCUMENTS',
    recursive: true,
  });
});

it('stays out of the way in a browser, without the module, and when writing fails', async () => {
  await expect(saveInAndroidShell(file(), {})).resolves.toBeNull();
  await expect(saveInAndroidShell(file(), { Capacitor: { isNativePlatform: () => false } })).resolves.toBeNull();
  await expect(
    saveInAndroidShell(file(), { Capacitor: { isNativePlatform: () => true, Plugins: {} } }),
  ).resolves.toBeNull();
  const writeFile = vi.fn().mockRejectedValue(new Error('no permission'));
  const scope = { Capacitor: { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile } } } };
  await expect(saveInAndroidShell(file(), scope)).resolves.toBeNull();
});
