let requestChart = null;
let endpointChart = null;

const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat().format(value || 0);

function setMessage(text = "") { $("message").textContent = text; }

function updateCards(a) {
  const total = a.overall?.requests || 0;
  const success = a.overall?.success || 0;
  const errors = a.overall?.errors || 0;
  $("daily").textContent = number(a.today?.requests);
  $("total").textContent = number(total);
  $("success").textContent = number(success);
  $("errors").textContent = number(errors);
  $("successRate").textContent = `${total ? ((success / total) * 100).toFixed(1) : 0}% of total`;
  $("errorRate").textContent = `${total ? ((errors / total) * 100).toFixed(1) : 0}% of total`;
}

async function getJSON(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

function renderRequestChart(days) {
  const labels = days.map(x => x.date);
  const ctx = $("requestChart");
  if (requestChart) requestChart.destroy();

  const makeGradient = (chart) => {
    const {ctx, chartArea} = chart;
    if (!chartArea) return "rgba(167,139,250,.18)";
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, "rgba(167,139,250,.24)");
    gradient.addColorStop(1, "rgba(167,139,250,0)");
    return gradient;
  };

  requestChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Requests",
        data: days.map(x => x.requests),
        borderColor: "#a78bfa",
        backgroundColor: makeGradient,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 3,
        tension: .42,
        fill: true
      }, {
        label: "Success",
        data: days.map(x => x.success),
        borderColor: "#4ade80",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: .42,
        fill: false
      }, {
        label: "Errors",
        data: days.map(x => x.errors),
        borderColor: "#fb7185",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: .42,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 800, easing: "easeOutQuart" },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: { color: "#a1a1aa", boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: "circle", padding: 18 }
        },
        tooltip: {
          backgroundColor: "#18181c",
          borderColor: "#303038",
          borderWidth: 1,
          titleColor: "#fff",
          bodyColor: "#d4d4d8",
          padding: 12,
          displayColors: true,
          intersect: false
        }
      },
      scales: {
        x: {
          border: { display: false },
          ticks: { color: "#71717a", maxRotation: 0, padding: 8 },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          ticks: { color: "#71717a", precision: 0, padding: 8 },
          grid: { color: "rgba(255,255,255,.055)", drawTicks: false }
        }
      }
    }
  });
}

function renderEndpointChart(items) {
  const top = items.slice(0, 10);
  const ctx = $("endpointChart");
  if (endpointChart) endpointChart.destroy();
  endpointChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map(x => `${x.method} ${x.path}`),
      datasets: [{ label: "Requests", data: top.map(x => x.requests), borderWidth: 0 }]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#71717a", precision: 0 }, grid: { color: "rgba(255,255,255,.06)" } },
        y: { ticks: { color: "#a1a1aa", font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

async function load() {
  setMessage("");
  try {
    const days = $("days").value;
    const [overview, daily] = await Promise.all([
      getJSON("/api/system/analytics"),
      getJSON(`/api/system/analytics/daily?days=${days}`)
    ]);

    if (!overview.analytics?.enabled) throw new Error("MongoDB analytics is not connected.");
    updateCards(overview.analytics);
    renderRequestChart(daily.analytics.days || []);
    renderEndpointChart(overview.analytics.byEndpoint || []);

    $("connection").className = "connection online";
    $("connection").innerHTML = "<i></i> MongoDB connected";
  } catch (error) {
    $("connection").className = "connection";
    $("connection").innerHTML = "<i></i> Database unavailable";
    setMessage(error.message);
  }
}

$("refresh").addEventListener("click", load);
$("days").addEventListener("change", load);
load();
