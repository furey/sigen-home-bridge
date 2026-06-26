export const HELP = {
  gatewayHost: {
    title: 'Finding your gateway IP',
    body: [
      { p: 'Enable Modbus TCP in the mySigen app: Settings → System Settings → General → Modbus TCP Server.' },
      { p: 'Then hit **Scan**: the bridge sweeps your LAN for the Modbus port and verifies each answer with a real register read, filling this field for you.' },
      { p: 'The address mySigen shows is usually wrong; trust the scan. To hunt manually instead, run (swap in your own subnet):' },
      { code: 'nmap -Pn -p 502 192.168.1.0/24' },
      { p: 'Either way, reserve the host as a static DHCP lease on your router so it never changes.' }
    ]
  },
  gatewayPort: {
    title: 'Modbus port',
    body: [
      { p: 'The gateway’s Modbus TCP port. 502 is the standard; leave it unless you changed it on the device.' }
    ]
  },
  unitId: {
    title: 'Unit ID',
    body: [
      { p: 'The Modbus unit (plant) address. 247 returns aggregate values across all inverters and batteries, which is what you want for the dashboard.' }
    ]
  },
  homekitPin: {
    title: 'Pairing PIN',
    body: [
      { p: 'The code you type when pairing in Apple Home, formatted ddd-dd-ddd (e.g. 516-35-163).' },
      { p: 'Pick any value. The bridge also prints a QR code to the logs on startup that you can scan instead.' }
    ]
  },
  homekitPort: {
    title: 'HAP port',
    body: [
      { p: 'TCP port the HomeKit bridge listens on. Any free port works (default 51826).' },
      { p: 'Changing it needs a restart and re-pairing in the Home app.' }
    ]
  },
  homekitBind: {
    title: 'Advertise on address',
    body: [
      { p: 'Apple Home discovers the bridge by an mDNS (Bonjour) broadcast. By default the bridge announces itself on **every** network it can see.' },
      { p: 'On a NAS or Docker host with extra internal networks (the 172.x bridge addresses), the Home app can latch onto one your iPhone can’t reach; pairing fails, or the accessories show “No Response”.' },
      { p: 'Set this to the LAN IP or interface name your phone uses to reach the bridge, so it only advertises there. On a normal PC or single-network setup, leave it blank.' },
      { code: '192.168.1.50   # or an interface name like eth0' }
    ]
  },
  googleToken: {
    title: 'Google auth token',
    body: [
      { p: 'A static bearer string used by the stub OAuth for Google Smart Home fulfillment. Make up any value; it’s personal-use only and travels over your Cloudflare tunnel.' },
      { p: 'Skip this unless you’re wiring up Google Home.' }
    ]
  },
  tariffRates: {
    title: 'Import & export rates',
    body: [
      { p: 'What you pay per kWh drawn from the grid (import) and earn per kWh sent back (export/feed-in), in your chosen currency.' },
      { p: 'These are the **fallback** rates, used whenever no time-of-use window covers the current time, i.e. your shoulder or anytime rate.' }
    ]
  },
  tariffWindows: {
    title: 'Time-of-use windows',
    body: [
      { p: 'Override the fallback rate for a time range, like a peak window or a free off-peak window. A window from 23:00 to 06:00 wraps past midnight.' },
      { p: 'A free period is just a window with a rate of **0**. Windows are read in this device’s local time.' }
    ]
  },
  metricScale: {
    title: 'Reading size',
    body: [
      { p: 'Scales the big readout numbers on the dashboard. 100% is the recommended size; drag up to enlarge for a wall display or down to fit more in view. Reset returns to 100%.' },
      { p: 'This only affects the desktop layout (wide landscape screens, roughly 1024px and up). Phones and tablets in portrait use a fixed size and ignore it. Hit **Save** and check the dashboard.' }
    ]
  },
  coordinates: {
    title: 'Setting coordinates',
    body: [
      { p: 'Leave both blank to auto-detect your city from the server’s public IP.' },
      { p: 'To pin an exact spot, right-click a location in Google Maps: the first number is latitude, the second is longitude.' }
    ]
  },
  energyStats: {
    title: 'Energy statistics',
    body: [
      { p: 'Lifetime counters accumulated by the gateway’s own firmware; they don’t reset when the bridge restarts or when you change settings.' },
      { p: '**Battery health** is the gateway’s estimate of remaining cell capacity relative to rated new capacity. It degrades gradually over years; 100% when new, typically flagged for service below 70–80%.' },
      { p: '**Consumed today** resets at midnight per the gateway’s local clock.' }
    ]
  },
  alertsRules: {
    title: 'How alerts work',
    body: [
      { p: 'Build any number of alerts. Each one watches a single value (battery charge, grid import or export, solar output, home usage, gateway reachability, outdoor temperature, cost per hour, and more) and notifies through the channels you pick. The trigger list only offers what your data supports, so weather and cost triggers appear once those are set up.' },
      { p: 'Every alert is checked against the live feed every few seconds and has to stay tripped for a short delay before it fires, so a single missed poll or a brief spike never raises a false alarm. Threshold alerts clear once the value moves back past the line with a little margin, so they don’t flicker around the edge.' },
      { p: 'Choose whether each alert notifies when it **starts**, when it **ends**, or both. To be told the gateway came back, add a Gateway offline alert and tick **it ends**.' }
    ]
  },
  alertsHomekit: {
    title: 'Apple Home sensor',
    body: [
      { p: 'Exposes this alert in Apple Home as a contact sensor that reads **Open** while the alert is active. Name it in the **Contact sensor name** field, or leave that blank to use the alert’s own name.' },
      { p: 'To be pushed when it trips, turn on the sensor’s own notifications in the Home app (tap the sensor, then Status and Notifications); the Automations tab only controls accessories and scenes, so the notification lives in the sensor’s settings, not an automation, and alerts while you’re away need a home hub. You can still use the sensor as an automation trigger to flip a light or run a scene.' },
      { p: 'The sensors are read when the bridge boots, so adding, removing, renaming, or retargeting an Apple Home alert needs a restart before Home sees the change (and a remove and re-add in the Home app, which caches paired names). Webhook-only alerts apply the moment you save.' }
    ]
  },
  alertsWebhook: {
    title: 'Webhook',
    body: [
      { p: 'Sends a JSON POST to the URL below each time this alert is raised or cleared (whichever edges you chose). Each alert has its own URL, so different alerts can hit different endpoints. Point it at ntfy, Pushover, Home Assistant, a Discord webhook, or anything that takes a POST.' },
      { p: 'The body carries the event, the alert’s id and name, the trigger type, and a readable message:' },
      { code: '{ "event": "raised", "name": "Battery flat",\n  "trigger": "batteryBelow",\n  "message": "Battery charge is at 12%" }' },
      { p: 'Hit **Test** to send a sample payload to the URL and confirm it lands.' }
    ]
  },
  passcode: {
    title: 'Settings passcode',
    body: [
      { p: 'A 4-digit passcode that locks the Settings area. With one set, the dashboard and readings stay open to anyone on the network, but changing any setting needs the passcode first.' },
      { p: 'This is a deterrent against casual changes on a shared LAN, not real security; the bridge has no user accounts and serves over plain HTTP. Don’t rely on it to protect an internet-exposed bridge.' },
      { p: 'Forgot it? Clear it on the server by deleting `data/settings.json` (or removing its `security` block) and restarting, then set a new one.' }
    ]
  },
  restartHomekit: {
    title: 'Restart required',
    body: [
      { p: 'The bridge name, pairing PIN, HAP port, power display, and advertise address are read once when the bridge boots, so they can’t change on a running bridge. Saving writes the new values, but they stay inactive until the service restarts.' },
      { p: 'There’s no restart button here; this page can’t restart the bridge for you. Restart it yourself, the same way you started it. With Docker Compose that’s:' },
      { code: 'docker compose restart' },
      { p: 'Changing the PIN or HAP port also means removing the bridge in the Home app and adding it again with the new code.' }
    ]
  },
  restartHomekitNaming: {
    title: 'Restart required',
    body: [
      { p: 'The accessory names, manufacturer, and model are read once when the bridge boots. Saving here stores them, but Apple Home won’t see the change until the service restarts.' },
      { p: 'Restart it the same way you started it. With Docker Compose that’s:' },
      { code: 'docker compose restart' },
      { p: 'Apple Home also keeps the names it first paired with, so after restarting, remove the accessory in the Home app and add it back with the pairing code to pick up the new names.' }
    ]
  },
  restartServer: {
    title: 'Restart required',
    body: [
      { p: 'The HTTP port is where this web interface is served. It’s read once when the bridge boots, so a new value can’t take effect on a running bridge. Saving writes the new port, but the server keeps using the old one until it restarts.' },
      { p: 'There’s no restart button here; this page can’t restart the bridge for you. Restart it yourself, the same way you started it. With Docker Compose that’s:' },
      { code: 'docker compose restart' },
      { p: 'After restarting, open the dashboard at the new port.' }
    ]
  },
  deviceStatus: {
    title: 'Inverter status',
    body: [
      { p: 'The inverter’s current operating state, read live from the gateway.' },
      { p: '**Running** is actively converting power. **Standby** is idle but ready, usually overnight with nothing to do. **Shutdown** is powered down or asleep. **Fault** means the inverter has flagged a problem worth checking in the mySigen app.' }
    ]
  },
  deviceSolar: {
    title: 'Solar (per inverter)',
    body: [
      { p: 'The DC power this one inverter is pulling from its own panels right now, before it’s converted to AC. It’s the sum of that inverter’s PV strings listed below.' },
      { p: 'On a system with more than one inverter, the dashboard’s solar figure is the total across all of them.' }
    ]
  },
  deviceActivePower: {
    title: 'Active power',
    body: [
      { p: 'The real AC power flowing through the inverter right now. Positive means it’s putting power out onto your home’s wiring (from solar or the battery); negative means it’s drawing power in, for example to charge the battery.' }
    ]
  },
  deviceTemperature: {
    title: 'Temperature',
    body: [
      { p: 'The inverter’s own internal temperature. It rises under heavy load and on hot days, and the unit throttles or pauses if it runs too hot, so an occasional high reading is normal.' }
    ]
  },
  deviceSoc: {
    title: 'Charge (state of charge)',
    body: [
      { p: 'State of charge (SoC): how full this inverter’s battery is, from 0% empty to 100% full. On a single-inverter system it matches the dashboard’s battery gauge.' }
    ]
  },
  deviceSoh: {
    title: 'Health (state of health)',
    body: [
      { p: 'State of health (SoH): the gateway’s estimate of the battery’s usable capacity against when it was new. 100% is factory-fresh, and it slips slowly over years of use.' },
      { p: 'A gradual decline is expected; most warranties cover the battery down to around 70%.' }
    ]
  },
  deviceStrings: {
    title: 'PV strings',
    body: [
      { p: 'A string is one chain of solar panels wired into a single input (MPPT tracker) on the inverter. Each row shows that string’s live output.' },
      { p: '**W** is the power it’s making, **V** the voltage across the panels, and **A** the current flowing. Strings facing different directions, or with one partly shaded, will read differently from each other.' }
    ]
  }
}
