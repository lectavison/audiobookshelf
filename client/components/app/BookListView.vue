<template>
  <div id="bookshelf" ref="scroller" class="w-full overflow-y-auto px-2 md:px-8 pb-8" @scroll="onScroll">
    <table class="w-full text-sm">
      <thead class="sticky top-0 z-10 bg-bg text-left text-gray-300">
        <tr>
          <th class="w-14 py-2"></th>
          <th class="py-2 px-2">{{ $strings.LabelTitle }}</th>
          <th class="py-2 px-2 hidden sm:table-cell">{{ $strings.LabelAuthor }}</th>
          <th class="py-2 px-2 hidden md:table-cell">{{ $strings.LabelSeries }}</th>
          <th class="py-2 px-2 hidden md:table-cell">{{ $strings.LabelFolder }}</th>
          <th class="py-2 px-2 hidden lg:table-cell text-right">{{ $strings.LabelDuration }}</th>
          <th class="py-2 px-2 hidden lg:table-cell text-right">{{ $strings.LabelAddedAt }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id" class="border-t border-white/10 hover:bg-white/5 cursor-pointer" @click="open(item)">
          <td class="py-1">
            <img :src="coverSrc(item)" loading="lazy" class="w-10 h-10 object-cover rounded-xs bg-primary" />
          </td>
          <td class="py-1 px-2">
            <p class="truncate max-w-[40vw] md:max-w-md">{{ title(item) }}</p>
            <p class="sm:hidden text-xs text-gray-400 truncate">{{ item.media.metadata.authorName }}</p>
          </td>
          <td class="py-1 px-2 hidden sm:table-cell truncate max-w-xs">{{ item.media.metadata.authorName }}</td>
          <td class="py-1 px-2 hidden md:table-cell truncate max-w-xs">{{ item.media.metadata.seriesName }}</td>
          <td class="py-1 px-2 hidden md:table-cell truncate max-w-xs text-gray-400" :title="item.path">{{ parentFolder(item) }}</td>
          <td class="py-1 px-2 hidden lg:table-cell text-right whitespace-nowrap">{{ item.media.duration ? $elapsedPretty(item.media.duration) : '' }}</td>
          <td class="py-1 px-2 hidden lg:table-cell text-right whitespace-nowrap">{{ item.addedAt ? $formatDate(item.addedAt, 'yyyy-MM-dd') : '' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="loading" class="text-center py-4 text-gray-300">{{ $strings.MessageLoading }}</p>
    <p v-else-if="initialized && !items.length" class="text-center py-12 text-xl">{{ $strings.MessageNoResults }}</p>
  </div>
</template>

<script>
const PAGE_SIZE = 100

export default {
  data() {
    return {
      items: [],
      total: 0,
      page: 0,
      loading: false,
      initialized: false,
      requestId: 0,
      lastQuery: ''
    }
  },
  computed: {
    libraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    settings() {
      return this.$store.state.user.settings
    },
    isPodcast() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType'] === 'podcast'
    }
  },
  methods: {
    title(item) {
      const metadata = item.media.metadata
      return this.settings.showSubtitles && metadata.subtitle ? `${metadata.title} - ${metadata.subtitle}` : metadata.title
    },
    parentFolder(item) {
      const parts = (item.relPath || '').split(/[\\/]/).filter(Boolean)
      parts.pop()
      return parts.slice(0, 2).join('/')
    },
    coverSrc(item) {
      return this.$store.getters['globals/getLibraryItemCoverSrc'](item)
    },
    open(item) {
      this.$router.push(`/item/${item.id}`)
    },
    buildQuery() {
      const params = new URLSearchParams()
      if (this.settings.filterBy && this.settings.filterBy !== 'all') params.set('filter', this.settings.filterBy)
      if (this.settings.orderBy) {
        params.set('sort', this.settings.orderBy)
        params.set('desc', this.settings.orderDesc ? 1 : 0)
      }
      if (this.settings.collapseSeries && !this.isPodcast) params.set('collapseseries', 1)
      params.set('limit', PAGE_SIZE)
      params.set('minified', 1)
      return params
    },
    async reset() {
      this.items = []
      this.total = 0
      this.page = 0
      this.initialized = false
      if (this.$refs.scroller) this.$refs.scroller.scrollTop = 0
      await this.loadMore()
    },
    async loadMore() {
      if (this.loading || !this.libraryId) return
      if (this.initialized && this.items.length >= this.total) return
      this.loading = true
      const requestId = ++this.requestId
      const params = this.buildQuery()
      this.lastQuery = params.toString()
      params.set('page', this.page)
      const payload = await this.$axios.$get(`/api/libraries/${this.libraryId}/items?${params.toString()}`).catch((error) => {
        console.error('Failed to fetch list view items', error)
        return null
      })
      if (requestId !== this.requestId) return
      this.loading = false
      this.initialized = true
      if (!payload) return
      this.total = payload.total
      this.items.push(...payload.results)
      this.page++
      this.$eventBus.$emit('bookshelf-total-entities', this.total)
      this.$nextTick(this.fillViewport)
    },
    fillViewport() {
      const el = this.$refs.scroller
      if (el && el.scrollHeight <= el.clientHeight) this.loadMore()
    },
    onScroll(e) {
      const el = e.target
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) this.loadMore()
    },
    settingsUpdated() {
      if (this.buildQuery().toString() === this.lastQuery) return
      this.requestId++
      this.loading = false
      this.reset()
    }
  },
  mounted() {
    this.reset()
    this.$eventBus.$on('user-settings', this.settingsUpdated)
  },
  beforeDestroy() {
    this.$eventBus.$off('user-settings', this.settingsUpdated)
  }
}
</script>
