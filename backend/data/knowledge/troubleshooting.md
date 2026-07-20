# Troubleshooting Common Internet Issues

> Sample knowledge-base article — replace with your real troubleshooting
> playbook.

## No internet connection at all

1. Check the router's **Internet/WAN** light — if it's red or off, the issue
   is likely upstream (fiber line or ONT), not the router itself.
2. Confirm the fiber cable is firmly connected at both the wall outlet and
   the router's WAN port.
3. Restart the router (unplug 15 seconds, plug back in) and wait 2–3
   minutes.
4. If the WAN light stays red after a restart, this usually indicates a line
   fault — a technician visit is needed. Use the `submit_support_ticket`
   tool to log this with issue type "Technical - Outage".

## Internet is slow

1. Ask whether the slowness happens on WiFi only, or on a wired (ethernet)
   connection too — this narrows down WiFi interference vs. a line issue.
2. Ask how many devices are connected and what they're doing (e.g., someone
   downloading a large file will slow down everyone else).
3. Suggest moving closer to the router, or reducing the number of walls
   between the device and the router.
4. Suggest switching from the 2.4GHz to the 5GHz network for devices that
   support it (much faster, less congested).
5. If speeds are still far below the plan's advertised speed after these
   steps, log a support ticket with issue type "Technical - Slow Speed" and
   include the customer's plan name and measured speed if available.

## WiFi network not visible

1. Confirm the router is powered on and the WiFi light is solid/blinking
   green.
2. Check whether the device's WiFi is enabled and airplane mode is off.
3. Try restarting the router.
4. If the 5GHz network is missing but 2.4GHz works, the customer may need to
   enable 5GHz manually in the admin panel.

## Frequent disconnects / dropped connection

1. Ask when the drops happen — constant vs. only at specific times of day
   (which often indicates network congestion at peak hours vs. a hardware
   issue).
2. Suggest a router restart.
3. If drops persist after a restart and happen throughout the day, this
   likely needs a technician visit — log a ticket with issue type
   "Technical - Intermittent Connection".

## Router lights meaning

| Light | Color | Meaning |
|---|---|---|
| Power | Solid green | Router powered and running normally |
| Internet/WAN | Solid green | Connected to WE's network |
| Internet/WAN | Red or off | No signal from the fiber line — escalate |
| WiFi | Solid/blinking green | WiFi broadcasting normally |
| LAN 1-4 | Green | A device is connected via ethernet on that port |

## When to escalate to a support ticket

Always use `submit_support_ticket` when:
- The WAN light stays red/off after a restart.
- Slow speeds persist after ruling out WiFi/device-side causes.
- The customer reports a billing discrepancy alongside a technical issue.
- The customer explicitly asks to speak with a human technician.
