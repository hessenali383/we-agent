# Router Setup & Configuration

> Sample knowledge-base article — replace with your real router documentation.

## Initial setup (WE Fiber ONT + router combo)

1. Connect the fiber cable from the wall outlet to the **WAN/Internet** port
   on the back of the router (usually colored differently from the LAN ports).
2. Plug the router into a power outlet and wait about 2 minutes for the
   **Power**, **Internet**, and **WiFi** lights to turn solid green.
3. On a phone or laptop, connect to the WiFi network name printed on the
   sticker on the bottom of the router (format: `WE-XXXXXX`).
4. The default WiFi password is also printed on that sticker. Customers
   should change it after first login for security.

## Accessing the router's admin panel

1. Open a browser and go to `http://192.168.1.1` (some models use
   `http://192.168.0.1`).
2. Log in with the default admin credentials printed on the router label
   (default username is usually `admin`).
3. From the dashboard, customers can change the WiFi name (SSID), password,
   enable a 5GHz network, set up port forwarding, or restart the router.

## Changing the WiFi name and password

1. Go to **Wireless Settings** in the admin panel.
2. Update the **SSID** (network name) field.
3. Update the **Security Key** (password) field — minimum 8 characters,
   WPA2/WPA3 recommended.
4. Click **Save & Apply**. All devices will need to reconnect using the new
   credentials.

## Enabling 5GHz WiFi

Most WE Fiber routers broadcast both 2.4GHz and 5GHz bands. If only 2.4GHz
appears:
1. Go to **Wireless Settings → 5GHz**.
2. Toggle **Enable Wireless** to on.
3. Set an SSID (can be the same as the 2.4GHz name with a "-5G" suffix, or
   a different name).
4. Save & Apply.

## Restarting the router

Unplug the power cable, wait 15 seconds, then plug it back in. Wait 2–3
minutes for all lights to return to solid green before testing the
connection again.

## Factory reset (last resort)

Press and hold the small recessed **Reset** button on the back of the router
for 10 seconds using a pin, until all lights flash. This erases all custom
settings and reverts to the factory defaults printed on the label. Only
recommend this after confirming the customer wants to lose custom
configuration (custom WiFi name/password, port forwarding rules, etc.).
