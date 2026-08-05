(() => {
  const endpoint = "/api/click-events";

  const send = payload => {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(endpoint, new Blob([body], { type:"application/json" }));
      if (accepted) return;
    }
    fetch(endpoint, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body,
      keepalive:true,
      credentials:"same-origin"
    }).catch(() => {});
  };

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = event.target.closest("a[data-track-product]");
    if (!link) return;
    const productId = Number(link.dataset.trackProduct);
    if (!Number.isInteger(productId) || productId <= 0) return;
    send({
      productId,
      sourcePage:link.dataset.trackSource || "unknown",
      placement:link.dataset.trackPlacement || "unknown",
      action:link.dataset.trackAction || "view_details"
    });
  }, { capture:true });
})();
