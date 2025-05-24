"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateArxivURL = void 0;
function generateArxivURL(query) {
    const baseURL = "http://export.arxiv.org/api/query?";
    let queryParams = [];
    queryParams.push(`search_query=all:${encodeURIComponent(query.searchQuery)}`);
    if (query.sortBy) {
        queryParams.push(`sortBy=${encodeURIComponent(query.sortBy)}`);
    }
    if (query.sortOrder) {
        queryParams.push(`sortOrder=${query.sortOrder}`);
    }
    if (query.maxResults) {
        queryParams.push(`max_results=${encodeURIComponent(query.maxResults)}`);
    }
    const url = baseURL + queryParams.join('&');
    return url;
}
exports.generateArxivURL = generateArxivURL;
