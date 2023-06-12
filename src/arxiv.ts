export interface ArxivQuery {
  searchQuery: string;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
  maxResults?: string;
}

export function generateArxivURL(query: ArxivQuery){
  const baseURL = "http://export.arxiv.org/api/query?";
  let queryParams: string[] = [];
  queryParams.push(`search_query=all:${encodeURIComponent(query.searchQuery)}`);
  if(query.sortBy){
    queryParams.push(`sortBy=${encodeURIComponent(query.sortBy)}`);
  }
  if(query.sortOrder){
    queryParams.push(`sortOrder=${query.sortOrder}`);
  }
  if(query.maxResults){
    queryParams.push(`max_results=${encodeURIComponent(query.maxResults)}`);
  }

  const url = baseURL + queryParams.join('&');
  return url;
}

export interface ArxivParer {
  title: string,
  link: string,
  author: string[],
  summary: string,
  published: Date,
}