function setupSearch() {
  const input = document.getElementById("searchInput");
  const button = document.getElementById("searchButton");
  const cards = document.querySelectorAll(".thesis-item");
  if (!input || !button || cards.length === 0) {
    return;
  }

  const handleSearch = () => {
    const keyword = input.value.trim().toLowerCase();
    cards.forEach((card) => {
      const title = card.querySelector(".thesis-title")?.textContent?.toLowerCase() || "";
      const summary = card.querySelector(".thesis-summary")?.textContent?.toLowerCase() || "";
      const matches = keyword.length === 0 || title.includes(keyword) || summary.includes(keyword);
      card.classList.toggle("hidden", !matches);
    });
  };

  button.addEventListener("click", handleSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  });
}

function setupOffcanvasCloseFallback() {
  if (typeof bootstrap === "undefined") {
    return;
  }

  const closeButtons = document.querySelectorAll(".offcanvas .btn-close");
  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.closest(".offcanvas");
      if (!panel) {
        return;
      }
      const instance = bootstrap.Offcanvas.getOrCreateInstance(panel);
      instance.hide();
    });
  });
}

setupSearch();
setupOffcanvasCloseFallback();
