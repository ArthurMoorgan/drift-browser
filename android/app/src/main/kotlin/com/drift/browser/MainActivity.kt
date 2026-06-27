package com.drift.browser

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.*
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.drift.browser.databinding.ActivityMainBinding
import com.drift.browser.databinding.ItemTabBinding
import org.mozilla.geckoview.*
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    // ─── Tab model ───────────────────────────────────────────────────────────
    data class DriftTab(
        val session: GeckoSession,
        var title: String = "New Tab",
        var url: String = "",
        var isLoading: Boolean = false,
        var progress: Int = 0,
        var canGoBack: Boolean = false,
        var canGoForward: Boolean = false,
    )

    // ─── State ───────────────────────────────────────────────────────────────
    private val tabs = mutableListOf<DriftTab>()
    private var activeTabIndex = 0
    private val activeTab get() = tabs.getOrNull(activeTabIndex)

    // ─── ViewBinding ─────────────────────────────────────────────────────────
    private lateinit var binding: ActivityMainBinding
    private lateinit var tabAdapter: TabGridAdapter

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applySystemBarInsets()
        setupBackHandler()
        setupListeners()
        setupTabRecycler()

        openNewTab(makeUrl = null) // home page on launch
    }

    override fun onResume() {
        super.onResume()
        activeTab?.session?.setActive(true)
    }

    override fun onPause() {
        super.onPause()
        tabs.forEach { it.session.setActive(false) }
    }

    override fun onDestroy() {
        super.onDestroy()
        tabs.forEach { it.session.close() }
        tabs.clear()
    }

    // ─── Insets ──────────────────────────────────────────────────────────────

    private fun applySystemBarInsets() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { _, insets ->
            val sys = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            binding.toolbar.updatePadding(top = sys.top)
            binding.bottomNav.updatePadding(bottom = sys.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    // ─── Back-press handler ──────────────────────────────────────────────────

    private fun setupBackHandler() {
        onBackPressedDispatcher.addCallback(this) {
            when {
                binding.tabSwitcherOverlay.isVisible -> hideTabSwitcher()
                binding.urlEditOverlay.isVisible -> hideUrlEdit()
                activeTab?.canGoBack == true -> activeTab?.session?.goBack()
                else -> {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        }
    }

    // ─── Listeners ───────────────────────────────────────────────────────────

    private fun setupListeners() {
        // Url bar tap → edit mode
        binding.urlBar.setOnClickListener { showUrlEdit() }

        // Edit mode: go on IME action
        binding.urlEditInput.setOnEditorActionListener { _, actionId, event ->
            val isGo = actionId == EditorInfo.IME_ACTION_GO
                    || actionId == EditorInfo.IME_ACTION_SEARCH
                    || (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)
            if (isGo) { commitUrlInput(); true } else false
        }
        binding.btnEditClose.setOnClickListener { hideUrlEdit() }
        binding.btnEditClear.setOnClickListener {
            binding.urlEditInput.text?.clear()
            binding.urlEditInput.requestFocus()
        }

        // Bottom nav
        binding.btnBack.setOnClickListener { activeTab?.session?.goBack() }
        binding.btnForward.setOnClickListener { activeTab?.session?.goForward() }
        binding.btnReload.setOnClickListener {
            val tab = activeTab ?: return@setOnClickListener
            if (tab.isLoading) tab.session.stop() else tab.session.reload()
        }
        binding.btnTabCount.setOnClickListener { showTabSwitcher() }
        binding.btnMenu.setOnClickListener { showMenu() }

        // Tab switcher controls
        binding.btnTabSwitcherClose.setOnClickListener { hideTabSwitcher() }
        binding.btnTabSwitcherNew.setOnClickListener { hideTabSwitcher(); openNewTab() }
    }

    // ─── Tab switcher RecyclerView ────────────────────────────────────────────

    private fun setupTabRecycler() {
        tabAdapter = TabGridAdapter(
            onSelect = { idx -> selectTab(idx); hideTabSwitcher() },
            onClose  = { idx -> closeTab(idx) }
        )
        binding.tabRecyclerView.layoutManager = GridLayoutManager(this, 2)
        binding.tabRecyclerView.adapter = tabAdapter
    }

    // ─── Tab management ──────────────────────────────────────────────────────

    private fun openNewTab(makeUrl: String? = null) {
        val session = GeckoSession()
        configureSession(session)
        session.open(DriftApplication.geckoRuntime)
        val tab = DriftTab(session)
        tabs.add(tab)
        selectTab(tabs.size - 1)
        session.loadUri(makeUrl ?: "file:///android_asset/newtab/index.html")
    }

    private fun openNewTab() = openNewTab(null)

    private fun selectTab(index: Int) {
        if (index !in tabs.indices) return
        activeTabIndex = index
        binding.geckoView.setSession(tabs[index].session)
        updateUI()
    }

    private fun closeTab(index: Int) {
        if (tabs.size <= 1) {
            // Replace with fresh home tab rather than fully closing
            val old = tabs.removeAt(0)
            old.session.close()
            openNewTab()
            return
        }
        val removed = tabs.removeAt(index)
        removed.session.close()
        activeTabIndex = activeTabIndex.coerceIn(0, tabs.size - 1)
        selectTab(activeTabIndex)
        tabAdapter.submitList(TabSnapshot.from(tabs, activeTabIndex))
        updateTabCount()
    }

    // ─── Session configuration ────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureSession(session: GeckoSession) {
        session.settings.useTrackingProtection = true

        session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(s: GeckoSession, url: String) = withTab(s) { tab ->
                tab.isLoading = true; tab.url = url
                if (tab == activeTab) runOnUiThread { setLoading(true) }
            }
            override fun onPageStop(s: GeckoSession, success: Boolean) = withTab(s) { tab ->
                tab.isLoading = false
                if (tab == activeTab) runOnUiThread { setLoading(false) }
            }
            override fun onProgressChange(s: GeckoSession, progress: Int) = withTab(s) { tab ->
                tab.progress = progress
                if (tab == activeTab) runOnUiThread { binding.progressBar.progress = progress }
            }
        }

        session.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                s: GeckoSession,
                url: String?
            ) = withTab(s) { tab ->
                tab.url = url ?: ""
                if (tab == activeTab) runOnUiThread { updateUrlBar(tab.url) }
            }
            override fun onCanGoBack(s: GeckoSession, canGoBack: Boolean) = withTab(s) { tab ->
                tab.canGoBack = canGoBack
                if (tab == activeTab) runOnUiThread { binding.btnBack.isEnabled = canGoBack }
            }
            override fun onCanGoForward(s: GeckoSession, canGoForward: Boolean) = withTab(s) { tab ->
                tab.canGoForward = canGoForward
                if (tab == activeTab) runOnUiThread { binding.btnForward.isEnabled = canGoForward }
            }
            override fun onNewSession(s: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
                openNewTab(uri)
                return GeckoResult.fromValue(tabs.last().session)
            }
        }

        session.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onTitleChange(s: GeckoSession, title: String?) = withTab(s) { tab ->
                tab.title = title?.takeIf { it.isNotBlank() } ?: "New Tab"
                if (tabAdapter.itemCount > 0) {
                    runOnUiThread { tabAdapter.submitList(TabSnapshot.from(tabs, activeTabIndex)) }
                }
            }
        }

        // Deny permission requests silently for v1 (no camera/location dialogs)
        session.permissionDelegate = object : GeckoSession.PermissionDelegate {
            override fun onContentPermissionRequest(
                s: GeckoSession,
                perm: GeckoSession.PermissionDelegate.ContentPermission
            ): GeckoResult<Int>? {
                return GeckoResult.fromValue(GeckoSession.PermissionDelegate.ContentPermission.VALUE_DENY)
            }
        }
    }

    private inline fun withTab(session: GeckoSession, block: (DriftTab) -> Unit) {
        tabs.find { it.session === session }?.let(block)
    }

    // ─── UI update helpers ────────────────────────────────────────────────────

    private fun updateUI() {
        val tab = activeTab ?: return
        updateUrlBar(tab.url)
        setLoading(tab.isLoading)
        binding.progressBar.progress = tab.progress
        binding.btnBack.isEnabled = tab.canGoBack
        binding.btnForward.isEnabled = tab.canGoForward
        updateTabCount()
    }

    private fun updateUrlBar(url: String) {
        val home = url.isEmpty()
                || url == "about:blank"
                || url.startsWith("file:///android_asset/newtab")
        val display = when {
            home -> ""
            url.startsWith("https://") -> url.removePrefix("https://").trimEnd('/')
            url.startsWith("http://")  -> url.removePrefix("http://").trimEnd('/')
            else -> url
        }
        binding.urlBar.text = display.ifEmpty { getString(R.string.search_hint) }
        binding.urlSecure.visibility = if (url.startsWith("https://") && !home) View.VISIBLE else View.GONE
    }

    private fun setLoading(loading: Boolean) {
        binding.progressBar.visibility = if (loading) View.VISIBLE else View.INVISIBLE
        binding.btnReload.setImageResource(
            if (loading) R.drawable.ic_stop else R.drawable.ic_reload
        )
    }

    private fun updateTabCount() {
        binding.btnTabCount.text = tabs.size.toString()
    }

    // ─── URL edit overlay ─────────────────────────────────────────────────────

    private fun showUrlEdit() {
        val currentUrl = activeTab?.url?.takeIf {
            it.isNotEmpty() && !it.startsWith("file:///android_asset")
        } ?: ""
        binding.urlEditInput.setText(currentUrl)
        binding.urlEditInput.selectAll()
        binding.urlEditOverlay.visibility = View.VISIBLE
        binding.urlEditInput.requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .showSoftInput(binding.urlEditInput, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun hideUrlEdit() {
        binding.urlEditOverlay.visibility = View.GONE
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .hideSoftInputFromWindow(binding.urlEditInput.windowToken, 0)
    }

    private fun commitUrlInput() {
        val text = binding.urlEditInput.text?.toString()?.trim() ?: return
        if (text.isEmpty()) { hideUrlEdit(); return }
        val url = smartNavigate(text)
        hideUrlEdit()
        activeTab?.session?.loadUri(url)
    }

    private fun smartNavigate(input: String): String {
        if (input.startsWith("http://") || input.startsWith("https://")
            || input.startsWith("about:") || input.startsWith("file://")) {
            return input
        }
        // Domain-like pattern (no spaces, has a dot)
        if (!input.contains(' ') && input.contains('.')) {
            try {
                val proto = "https://$input"
                java.net.URI(proto) // validates structure
                return proto
            } catch (_: Exception) { }
        }
        return "https://www.google.com/search?q=${URLEncoder.encode(input, "UTF-8")}"
    }

    // ─── Tab switcher overlay ─────────────────────────────────────────────────

    private fun showTabSwitcher() {
        tabAdapter.submitList(TabSnapshot.from(tabs, activeTabIndex))
        binding.tabSwitcherOverlay.visibility = View.VISIBLE
    }

    private fun hideTabSwitcher() {
        binding.tabSwitcherOverlay.visibility = View.GONE
    }

    // ─── Menu (stub for v1) ───────────────────────────────────────────────────

    private fun showMenu() {
        val items = arrayOf("New tab", "Reload", "Find in page…", "Settings (coming soon)")
        android.app.AlertDialog.Builder(this)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> openNewTab()
                    1 -> activeTab?.session?.reload()
                    else -> { /* stub */ }
                }
            }
            .show()
    }

    // ─── Tab snapshot for adapter ─────────────────────────────────────────────

    data class TabSnapshot(
        val id: Long,
        val title: String,
        val url: String,
        val isActive: Boolean,
    ) {
        companion object {
            fun from(tabs: List<DriftTab>, activeIdx: Int) = tabs.mapIndexed { i, tab ->
                TabSnapshot(
                    id       = System.identityHashCode(tab.session).toLong(),
                    title    = tab.title,
                    url      = tab.url,
                    isActive = i == activeIdx,
                )
            }
        }
    }

    // ─── Tab grid adapter ─────────────────────────────────────────────────────

    inner class TabGridAdapter(
        private val onSelect: (Int) -> Unit,
        private val onClose:  (Int) -> Unit,
    ) : ListAdapter<TabSnapshot, TabGridAdapter.VH>(TAB_DIFF) {

        inner class VH(val b: ItemTabBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val b = ItemTabBinding.inflate(layoutInflater, parent, false)
            return VH(b)
        }

        override fun onBindViewHolder(holder: VH, position: Int) {
            val snap = getItem(position)
            holder.b.tabTitle.text = snap.title.ifEmpty { getString(R.string.new_tab) }
            val shortUrl = snap.url.removePrefix("https://").removePrefix("http://").trimEnd('/')
            holder.b.tabUrl.text = if (snap.url.startsWith("file:///android_asset")) "" else shortUrl
            holder.b.root.isSelected = snap.isActive
            holder.b.root.setOnClickListener { onSelect(holder.bindingAdapterPosition) }
            holder.b.btnTabClose.setOnClickListener { onClose(holder.bindingAdapterPosition) }
        }

    }

    companion object {
        private val TAB_DIFF = object : DiffUtil.ItemCallback<TabSnapshot>() {
            override fun areItemsTheSame(a: TabSnapshot, b: TabSnapshot) = a.id == b.id
            override fun areContentsTheSame(a: TabSnapshot, b: TabSnapshot) = a == b
        }
    }
}
