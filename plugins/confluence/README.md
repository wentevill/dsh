# DSH Confluence

`dsh-confluence` connects DeepSeek Harness to Confluence Data Center 7.9 or newer.
It provides structured page search and read tools plus approval-gated page creation
and optimistic-version updates.

## Configuration

Install the production archive, restart Desktop, then open Plugin configuration:

1. Enter the full HTTPS base URL, including a context path such as `/confluence`.
2. Create a Confluence Personal Access Token and paste it into the write-only Token field.
3. Configure allowed Space Keys, or explicitly enable access to every space visible to the Token.
4. Select **Save and test connection**.

The Token is stored through DSH Credentials under a site-bound `CONFLUENCE_PAT_<HASH>` reference; it is not
stored in Settings or returned through the plugin Remote. HTTP and custom CA
certificates are not supported.

## Tools

- `confluence_search_pages`
- `confluence_read_page`
- `confluence_create_page` (human approval required)
- `confluence_update_page` (human approval and the current page version required)

Search uses structured filters rather than arbitrary CQL. Page writes accept a
safe Markdown subset. Deletion, attachments, comments, page moves, macros,
Confluence Cloud, and raw storage XHTML are outside the first release.
