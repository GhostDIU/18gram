import fs from 'fs';

/**
 * Collection Reporter
 * Generates structured console summaries, GitHub Step Summaries,
 * and records runs in Supabase collection_runs.
 */
export class CollectionReporter {
  constructor() {
    this.startedAt = new Date();
    this.completedAt = null;
    this.pagesFetched = 0;
    this.providerRequests = 0;
    this.videosDiscovered = 0;
    this.uniqueNewRecords = 0;
    this.duplicatesSkipped = 0;
    this.recordsUpdated = 0;
    this.failedProviderCount = 0;
    this.rateLimitEvents = 0;
    this.status = 'success';
    this.summaryNotes = '';
    this.targetNewLinks = 200;
    this.maxNewLinks = 300;
    this.storageHealth = null;
    this.providerMetrics = {}; // provider -> { requests, pages, discovered, newItems, duplicates, errors, rateLimits }
  }

  initProvider(name) {
    if (!this.providerMetrics[name]) {
      this.providerMetrics[name] = {
        requests: 0,
        pages: 0,
        discovered: 0,
        newItems: 0,
        duplicates: 0,
        errors: 0,
        rateLimits: 0
      };
    }
  }

  recordPageFetch(source, { itemCount = 0, requests = 1, isRateLimit = false, isError = false }) {
    this.initProvider(source);
    this.pagesFetched++;
    this.providerRequests += requests;
    this.videosDiscovered += itemCount;

    const pm = this.providerMetrics[source];
    pm.pages++;
    pm.requests += requests;
    pm.discovered += itemCount;

    if (isRateLimit) {
      this.rateLimitEvents++;
      pm.rateLimits++;
    }
    if (isError) {
      pm.errors++;
    }
  }

  recordBatchResult(source, { newCount = 0, dupCount = 0, updatedCount = 0 }) {
    this.initProvider(source);
    this.uniqueNewRecords += newCount;
    this.duplicatesSkipped += dupCount;
    this.recordsUpdated += updatedCount;

    const pm = this.providerMetrics[source];
    pm.newItems += newCount;
    pm.duplicates += dupCount;
  }

  finish({ status, notes, storageHealth, targetNewLinks, maxNewLinks }) {
    this.completedAt = new Date();
    this.status = status || this.status;
    this.summaryNotes = notes || this.summaryNotes;
    this.storageHealth = storageHealth || this.storageHealth;
    this.targetNewLinks = targetNewLinks || this.targetNewLinks;
    this.maxNewLinks = maxNewLinks || this.maxNewLinks;

    // Count failed providers
    this.failedProviderCount = Object.values(this.providerMetrics)
      .filter(m => m.requests > 0 && m.newItems === 0 && m.errors > 0)
      .length;
  }

  getDurationMs() {
    const end = this.completedAt ? this.completedAt.getTime() : Date.now();
    return end - this.startedAt.getTime();
  }

  /**
   * Produce run record object for database.
   */
  toDatabaseRecord() {
    return {
      startedAt: this.startedAt.toISOString(),
      completedAt: this.completedAt ? this.completedAt.toISOString() : new Date().toISOString(),
      durationMs: this.getDurationMs(),
      pagesFetched: this.pagesFetched,
      providerRequests: this.providerRequests,
      videosDiscovered: this.videosDiscovered,
      uniqueNewRecords: this.uniqueNewRecords,
      duplicatesSkipped: this.duplicatesSkipped,
      recordsUpdated: this.recordsUpdated,
      failedProviderCount: this.failedProviderCount,
      rateLimitEvents: this.rateLimitEvents,
      storageUsedBytes: this.storageHealth?.dbSizeBytes || 0,
      storagePercentage: this.storageHealth?.usagePercentage || 0,
      status: this.status,
      summaryNotes: this.summaryNotes,
      providerStats: this.providerMetrics
    };
  }

  /**
   * Log human-readable terminal report.
   */
  printConsoleSummary() {
    const durationSec = (this.getDurationMs() / 1000).toFixed(1);
    console.log('\n================================================================');
    console.log(`🚀 18gram Video Discovery Run Summary [Status: ${this.status.toUpperCase()}]`);
    console.log('================================================================');
    console.log(`⏱️ Duration:           ${durationSec}s`);
    console.log(`🎯 New Unique Target:  ${this.targetNewLinks} (Max Cap: ${this.maxNewLinks})`);
    console.log(`✨ New Unique Stored:  ${this.uniqueNewRecords}`);
    console.log(`🔄 Duplicates Skipped: ${this.duplicatesSkipped}`);
    console.log(`📝 Existing Updated:   ${this.recordsUpdated}`);
    console.log(`🔍 Total Discovered:   ${this.videosDiscovered}`);
    console.log(`📄 Pages Fetched:      ${this.pagesFetched}`);
    console.log(`🌐 Provider Requests:  ${this.providerRequests}`);
    console.log(`⚠️ Rate-Limit Events:  ${this.rateLimitEvents}`);
    console.log(`❌ Failed Providers:   ${this.failedProviderCount}`);

    if (this.storageHealth) {
      const dbMb = (this.storageHealth.dbSizeBytes / (1024 * 1024)).toFixed(1);
      const tblMb = (this.storageHealth.videosTableBytes / (1024 * 1024)).toFixed(1);
      console.log(`💾 DB Storage:         ${dbMb} MB (${this.storageHealth.usagePercentage}%)`);
      console.log(`📊 Videos Table Size:  ${tblMb} MB (${this.storageHealth.totalVideoCount} rows)`);
      if (this.storageHealth.isWarning) {
        console.warn(`⚠️ STORAGE WARNING: DB usage exceeded threshold (${this.storageHealth.usagePercentage}%)`);
      }
    }

    console.log('\n--- Provider Yield Ranking ---');
    console.log('Provider   | Requests | Discovered | New Unique | Yield % | Errors');
    console.log('-----------|----------|------------|------------|---------|-------');

    // Sort providers by unique new items desc
    const sorted = Object.entries(this.providerMetrics).sort((a, b) => b[1].newItems - a[1].newItems);
    for (const [name, m] of sorted) {
      const yieldPct = m.requests > 0 ? ((m.newItems / m.requests)).toFixed(1) : '0.0';
      const pName = name.padEnd(10, ' ');
      const reqs = String(m.requests).padEnd(8, ' ');
      const disc = String(m.discovered).padEnd(10, ' ');
      const nItems = String(m.newItems).padEnd(10, ' ');
      const yPct = (yieldPct + ' item/req').padEnd(7, ' ');
      const errs = String(m.errors);
      console.log(`${pName} | ${reqs} | ${disc} | ${nItems} | ${yPct} | ${errs}`);
    }

    if (this.summaryNotes) {
      console.log(`\n📌 Notes: ${this.summaryNotes}`);
    }
    console.log('================================================================\n');
  }

  /**
   * Write formatted markdown table to GitHub Step Summary if running in GitHub Actions.
   */
  writeGitHubStepSummary() {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) return;

    try {
      const durationSec = (this.getDurationMs() / 1000).toFixed(1);
      const remainingTarget = Math.max(0, this.targetNewLinks - this.uniqueNewRecords);
      const dbMb = this.storageHealth ? (this.storageHealth.dbSizeBytes / (1024 * 1024)).toFixed(1) : 'N/A';
      const tblMb = this.storageHealth ? (this.storageHealth.videosTableBytes / (1024 * 1024)).toFixed(1) : 'N/A';
      const pct = this.storageHealth ? `${this.storageHealth.usagePercentage}%` : 'N/A';
      const rows = this.storageHealth?.totalVideoCount ?? 'N/A';

      let md = `## 🔞 18gram Video Discovery Run: \`${this.status.toUpperCase()}\`\n\n`;

      if (this.storageHealth?.isCritical) {
        md += `> [!CAUTION]\n> **CRITICAL DB STORAGE ALERT**: Database usage reached ${pct}. Additional collection halted to protect free tier limit.\n\n`;
      } else if (this.storageHealth?.isWarning) {
        md += `> [!WARNING]\n> **STORAGE WARNING**: Database usage reached ${pct}. Collection volume scaled back.\n\n`;
      }

      md += `| Metric | Value |\n`;
      md += `| :--- | :--- |\n`;
      md += `| **Duration** | \`${durationSec}s\` |\n`;
      md += `| **New Unique Stored** | **\`${this.uniqueNewRecords}\`** (Target: \`${this.targetNewLinks}\`, Cap: \`${this.maxNewLinks}\`) |\n`;
      md += `| **Remaining Target** | \`${remainingTarget}\` |\n`;
      md += `| **Duplicates Skipped** | \`${this.duplicatesSkipped}\` |\n`;
      md += `| **Records Updated** | \`${this.recordsUpdated}\` |\n`;
      md += `| **Total Discovered** | \`${this.videosDiscovered}\` |\n`;
      md += `| **Pages Fetched** | \`${this.pagesFetched}\` |\n`;
      md += `| **Provider Requests** | \`${this.providerRequests}\` |\n`;
      md += `| **Rate-Limit Events** | \`${this.rateLimitEvents}\` |\n`;
      md += `| **DB Storage Used** | \`${dbMb} MB\` (\`${pct}\`) |\n`;
      md += `| **Videos Table Size** | \`${tblMb} MB\` (\`${rows} rows\`) |\n\n`;

      md += `### 📊 Provider Performance Breakdown\n\n`;
      md += `| Provider | Requests | Discovered | New Unique | Duplicates | Yield (items/req) | Errors |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      const sorted = Object.entries(this.providerMetrics).sort((a, b) => b[1].newItems - a[1].newItems);
      for (const [name, m] of sorted) {
        const yieldRatio = m.requests > 0 ? (m.newItems / m.requests).toFixed(2) : '0.00';
        md += `| **${name}** | \`${m.requests}\` | \`${m.discovered}\` | **\`${m.newItems}\`** | \`${m.duplicates}\` | \`${yieldRatio}\` | \`${m.errors}\` |\n`;
      }

      if (this.summaryNotes) {
        md += `\n**Run Notes:** ${this.summaryNotes}\n`;
      }

      fs.appendFileSync(summaryPath, md, 'utf8');
    } catch (err) {
      console.warn('[reporter] Could not write GITHUB_STEP_SUMMARY:', err.message);
    }
  }
}
