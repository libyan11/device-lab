# Device Lab

A browser tool that tests hardware you plug in, using Chrome or Edge on a computer: gamepads, keyboard, mouse, touch, audio, camera, MIDI, raw HID/serial/USB/Bluetooth devices, appliances, and your display. One tab per kind of device, one shared report.

**Use it online (no install): https://libyan11.github.io/device-lab/**

Use Chrome or Edge on a computer. Everything runs in your browser; nothing is uploaded.

## Run

Double-click `start.bat`. It serves the folder at http://127.0.0.1:8791 and opens http://127.0.0.1:8791/devices.html in Chrome (USB, HID, serial and the camera need a secure origin like localhost). Requires Python (`py`) and Chrome. Close the window to stop the server.

If you see a **404 error**, the browser reached some other server. Close every `start.bat` window, run Device Lab's `start.bat` again, and open `http://127.0.0.1:8791/devices.html` (the address `http://127.0.0.1:8791/` also redirects there). Opening `devices.html` by double-clicking the file does not work.

## What it tests

| Tab | Plug in / use | What it checks |
|---|---|---|
| Gamepads | Xbox 360/One/Series, Switch Pro, 8BitDo, Logitech, generic USB pads (anything the Gamepad API sees) | Identification by vendor/product, stick drift and range, every button, analog vs digital triggers, rumble, update rate |
| Keyboard | Any keyboard | Every-key coverage map, rollover (keys held at once), chatter (a press that types twice) |
| Mouse | Any mouse or trackpad | Buttons incl. side buttons, click chatter, scroll-wheel glitches, polling rate |
| Touch & pen | Touchscreen, pen, trackpad | Dead-zone grid sweep, multi-touch count, pressure and tilt |
| Audio | Microphone, speakers, headphones | Noise floor, clipping, voice level and signal-to-noise, speaker-to-mic loopback, left/right channel check |
| Camera | Webcam | Opens, resolution, real frame rate, frozen picture, brightness, sharpness, colour cast |
| MIDI | Keyboards, pads, knobs, interfaces | Ports, notes, velocity range, controllers, stuck notes, test note out |
| Raw HID | Any other HID device (arcade sticks, wheels, pedals, flight sticks, unknown controllers) | Device and usage info, report rate, which input bytes are buttons, analog axes or counters |
| Serial / USB / BLE | Arduino/ESP32 boards, USB-serial adapters, any USB device, Bluetooth LE gadgets | Serial terminal, USB descriptors and speed, BLE battery and device info |
| Storage | USB flash drives, SSDs, SD cards, external disks | Real write and read speed, sustained speed (cache running out), data integrity of everything written, small-file speed, and in fill mode a counterfeit-capacity check |
| Appliances | Anything with no data connection: hair dryer, fan, vacuum, blender, shaver, fridge, drill | Sound signature (running vs background, main tone, steadiness, mains hum, speed settings really differ), vibration and magnetic field via a phone's motion sensor and compass. Not an electrical safety test |
| Display | Monitor, laptop screen | Colour-fill dead-pixel test, real refresh rate, dropped frames |

The Overview tab shows which of these your browser supports and what is already plugged in.

### Testing a USB drive or SSD

1. Make an empty folder on the drive (for example `E:\speedtest`) and click **Choose folder on the drive**. Browsers won't open a drive's root.
2. Pick a size and **Start test**. The test creates a temporary sub-folder in that folder, writes known data, reads every block back, and deletes only what it created. 1 GB or more gives a fair read speed, because small tests are served from your computer's memory cache.
3. Read the report: write and read MB/s, whether speed collapses once the drive's cache fills, whether every block came back intact, and small-file speed.
4. **Fill all free space** writes until the drive is full, then verifies everything. A counterfeit drive that claims a big size but only has a little real memory overwrites its old data, and this mode catches it and estimates the real size. It can take hours on a big drive. Never use it on your system drive.

The browser cannot see a drive's label or free space, so it can't tell whether the folder you chose is really on a USB drive; that's up to you.

### Testing an appliance (for example a hair dryer)

1. Open the Appliances tab and click **Start microphone**. Put the mic about 30 cm away and to the side of the appliance, out of its airflow (moving air booms into a mic).
2. With the appliance off, click **Record background**.
3. Name the setting ("Low"), switch the appliance on, click **Record running**. Repeat for each setting.
4. Read the table: how much louder than the background, the main tone, how steady it is, any mains hum, and whether two settings really sound different.
5. For vibration and magnetic field, open the page on a phone (these sensors need a secure page; on Android use USB debugging and `chrome://inspect` port forwarding to localhost) and rest the phone on the appliance.

The thresholds are reasonable guesses, not calibrated on real appliances. It is a relative test: the best use is to record a known-good unit and the suspect one the same way and compare. It cannot see heat or airflow and is not an electrical safety test; never open or probe a plugged-in appliance.

## Adding a new device type

Write `devices/mod-<name>.js` (an object with `id`, `title`, `blurb`, `supported()` and `mount(root, ctx)`; copy a small one such as `mod-display.js`), then register it in the `MODULES` list in `devices/app.js`. Put any maths in `devices/core.js` so it can be unit-tested.

## Files

- `devices.html`, `devices/`: the app (`core.js` holds the testable analysis code; `app.js` the shell and report; `mod-*.js` one file per tab)
- `tests/devices-run.html`: automated tests: unit tests, then the real page driven with simulated gamepads, keyboard, mouse, touch, microphone, camera, MIDI, HID, serial, USB, Bluetooth and phone sensors from `tests/mock-devices.js`
- `tools/run-tests.mjs`: runs the tests headless

## Running the tests

Headless, from a terminal (needs Node 22+, Chrome and Python; exit code 0 means everything passed; takes about 3 minutes):

```
node tools/run-tests.mjs
```

Or open `tests/devices-run.html` through `start.bat`'s server and keep the tab visible and focused: browsers pause animation in background tabs, and the timed tests depend on it.

The simulated devices prove the page's logic is self-consistent, not that every physical device behaves identically. Real hardware is still the final check.
