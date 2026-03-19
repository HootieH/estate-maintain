/**
 * Shared pagination utilities for list components.
 *
 * Usage in a component:
 *   // Extract data + pagination from API response
 *   const { items, pagination } = Pagination.extract(apiResponse);
 *
 *   // Render the pagination bar HTML (returns '' if only one page)
 *   const paginationHtml = Pagination.render(pagination, 'ComponentName');
 *
 *   // Each component should implement goToPage(page) that re-fetches with ?page=N&limit=25
 */
const Pagination = {
  /**
   * Extracts items array and pagination metadata from an API response.
   * Handles both old format (plain array) and new format ({ data, pagination }).
   */
  extract(response, fallbackKey) {
    if (Array.isArray(response)) {
      return {
        items: response,
        pagination: { page: 1, limit: response.length, total: response.length, totalPages: 1 }
      };
    }
    const items = response.data || response[fallbackKey] || [];
    const pagination = response.pagination || {
      page: 1,
      limit: items.length,
      total: items.length,
      totalPages: 1
    };
    return { items, pagination };
  },

  /**
   * Returns pagination bar HTML. Returns empty string if totalPages <= 1.
   */
  render(pagination, componentName) {
    const { page, total, totalPages } = pagination;
    if (!totalPages || totalPages <= 1) return '';

    const limit = pagination.limit || 25;
    const start = Math.min((page - 1) * limit + 1, total);
    const end = Math.min(page * limit, total);

    return `
      <div class="pagination-bar">
        <span class="pagination-info">Showing ${start}-${end} of ${total}</span>
        <div class="pagination-controls">
          <button class="btn btn-sm btn-secondary" onclick="${componentName}.goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
            <i data-lucide="chevron-left"></i> Prev
          </button>
          <span class="pagination-current">Page ${page} of ${totalPages}</span>
          <button class="btn btn-sm btn-secondary" onclick="${componentName}.goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>
            Next <i data-lucide="chevron-right"></i>
          </button>
        </div>
      </div>
    `;
  }
};
