// The world map. Leaflet is loaded from the CDN in index.html.
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Airport dots. If the request fails we just keep the map without them.
async function showAirports() {
  try {
    const res = await fetch('/api/airports');
    if (!res.ok) return;
    const airports = await res.json();

    for (const airport of airports) {
      L.circleMarker([airport.lat, airport.lon], {
        radius: 3,
        color: '#1f3a5f',
        weight: 1,
        fillColor: '#3c78c3',
        fillOpacity: 0.8,
      })
        .bindTooltip(`${airport.iata} ${airport.name}`)
        .addTo(map);
    }
  } catch (err) {
    // No airports, but the map still works.
  }
}

showAirports();

// Flight search. Asks the server for the flight the user typed.
const searchForm = document.getElementById('search');
const flightInput = document.getElementById('flight');
const message = document.getElementById('message');

// The route line and airport markers currently on the map, so a new search can remove them.
let flightLayer = null;

// Remove the last flight's route and markers, if there are any.
function clearFlight() {
  if (flightLayer) {
    flightLayer.remove();
    flightLayer = null;
  }
}

// Draw the route as a line from one airport to the other, with a marker at each end,
// and zoom the map to fit it. The label on the arrival airport says where the flight goes.
function showFlight(flight) {
  const points = flight.points.map((p) => [p.lat, p.lon]);
  const line = L.polyline(points, { color: '#d9480f', weight: 3 });
  const from = L.circleMarker([flight.from.lat, flight.from.lon], { radius: 6, color: '#d9480f', fillOpacity: 1 })
    .bindTooltip(`${flight.from.iata} ${flight.from.name}`);
  const to = L.marker([flight.to.lat, flight.to.lon])
    .bindTooltip(`${flight.callsign}: ${flight.from.iata} → ${flight.to.iata}`, { permanent: true });

  flightLayer = L.layerGroup([line, from, to]).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [40, 40] });
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  // Clear the old flight first, so it doesn't stay on the map looking like the answer.
  clearFlight();
  const number = flightInput.value.trim();

  try {
    // encodeURIComponent so a / or ? typed in the box can't change the request
    const res = await fetch(`/api/flight/${encodeURIComponent(number)}`);
    if (res.status === 404) {
      message.textContent = `We couldn't find ${number}. Check the flight number. For a one-digit flight like QF1, try the airline's 3-letter code: QFA1.`;
      return;
    }
    if (!res.ok) {
      message.textContent = 'Route data is unavailable right now, try again soon.';
      return;
    }
    showFlight(await res.json());
  } catch (err) {
    message.textContent = 'Route data is unavailable right now, try again soon.';
  }
});

// Warning areas (SIGMETs): storms, turbulence, icing and so on, drawn as coloured shapes.
// Asked for when the page loads and again every minute.

// The colour and the words for each kind of hazard.
function hazardStyle(hazard) {
  if (hazard === 'TS') {
    return { color: '#7b2cbf', label: 'Thunderstorms' };
  }
  if (hazard === 'TURB') {
    return { color: '#f08c00', label: 'Turbulence' };
  }
  if (hazard === 'ICE') {
    return { color: '#f08c00', label: 'Icing' };
  }
  if (hazard === 'VA') {
    return { color: '#868e96', label: 'Volcanic ash' };
  }
  if (hazard === 'TC') {
    return { color: '#e03131', label: 'Tropical cyclone' };
  }
  if (hazard === 'MTW') {
    return { color: '#8b5a2b', label: 'Mountain waves' };
  }
  return { color: '#fcc419', label: 'Other hazard' };
}

// The warning shapes currently on the map, so the next refresh can replace them.
let warningLayer = null;

// "Valid until" in the viewer's own time, e.g. "Wed 24 Sep, 3:00 pm".
function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function drawWarnings(warnings) {
  const shapes = [];
  for (const warning of warnings) {
    if (warning.shape?.type !== 'polygon') continue;
    const style = hazardStyle(warning.hazard);
    const polygon = L.polygon(warning.shape.coords, {
      color: style.color,
      weight: 1,
      fillColor: style.color,
      fillOpacity: 0.3,
    }).bindTooltip(`${warning.name}<br>${style.label}<br>Valid until ${formatTime(warning.validTo)}`);
    shapes.push(polygon);
  }

  // Swap the old layer for the new one in one go.
  if (warningLayer) warningLayer.remove();
  warningLayer = L.layerGroup(shapes).addTo(map);
}

// If the request fails, keep whatever shapes are already on the map.
async function showWarnings() {
  try {
    const res = await fetch('/api/warnings');
    if (!res.ok) return;
    const warnings = await res.json();
    drawWarnings(warnings);
  } catch (err) {
    // Keep the last shapes.
  }
}

showWarnings();
setInterval(showWarnings, 60 * 1000);

// A small legend in the bottom-left corner so people know what the colours mean.
const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `
    <strong>Warnings</strong>
    <div><span class="swatch" style="background:#7b2cbf"></span>Thunderstorms</div>
    <div><span class="swatch" style="background:#f08c00"></span>Turbulence</div>
    <div><span class="swatch" style="background:#74c0fc"></span>Icing</div>
    <div><span class="swatch" style="background:#868e96"></span>Volcanic ash</div>
    <div><span class="swatch" style="background:#e03131"></span>Tropical cyclone</div>
    <div><span class="swatch" style="background:#8b5a2b"></span>Mountain waves</div>
    <div><span class="swatch" style="background:#fcc419"></span>Other</div>
  `;
  return div;
};
legend.addTo(map);
