<template>
  <div id="bookshelf" ref="scroller" class="w-full overflow-y-auto px-2 pb-8" @scroll="onScroll">
    <table class="w-full text-sm">
      <thead class="sticky top-0 z-10 bg-bg text-left text-gray-300">
        <tr>
          <th class="py-2" :style="{ width: coverSize + 8 + 'px' }"></th>
          <th class="py-2 px-2 w-[40%]">{{ $strings.LabelTitle }}</th>
          <th class="py-2 px-2 hidden sm:table-cell w-[25%]">{{ $strings.LabelAuthor }}</th>
          <th class="py-2 px-2 hidden md:table-cell w-[25%]">{{ $strings.LabelSeries }}</th>
          <th class="py-2 px-2 hidden md:table-cell w-px whitespace-nowrap">{{ $strings.LabelFolder }}</th>
          <th class="py-2 px-2 hidden lg:table-cell text-left w-px whitespace-nowrap">{{ $strings.LabelPublishYear }}</th>
          <th class="py-2 px-2 hidden lg:table-cell text-left w-px whitespace-nowrap">{{ $strings.LabelDuration }}</th>
          <th class="py-2 px-2 hidden lg:table-cell text-left w-px whitespace-nowrap">{{ $strings.LabelSize }}</th>
          <th class="py-2 px-2 hidden lg:table-cell text-left w-px whitespace-nowrap">{{ $strings.LabelAddedAt }}</th>
          <th class="py-2 px-2 hidden xl:table-cell text-left w-px whitespace-nowrap">{{ $strings.LabelFileBirthtime }}</th>
          <th class="py-2 px-2 hidden xl:table-cell text-left w-px whitespace-nowrap">{{ $strings.LabelFileModified }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id" class="border-t border-white/10 hover:bg-white/5 cursor-pointer" @click="open(item)">
          <td class="py-1">
            <img :src="coverSrc(item)" loading="lazy" class="object-cover rounded-xs bg-primary" :style="{ width: coverSize + 'px', height: coverSize + 'px' }" />
          </td>
          <td class="py-1 px-2 max-w-0">
            <p class="truncate">{{ title(item) }}</p>
            <p class="sm:hidden text-xs text-gray-400 truncate">{{ item.media.metadata.authorName }}</p>
          </td>
          <td class="py-1 px-2 hidden sm:table-cell truncate max-w-0">{{ item.media.metadata.authorName }}</td>
          <td class="py-1 px-2 hidden md:table-cell truncate max-w-0">{{ item.media.metadata.seriesName === 'no series' ? '' : item.media.metadata.seriesName }}</td>
          <td class="py-1 px-2 hidden md:table-cell whitespace-nowrap text-gray-400" :title="item.path">{{ parentFolder(item) }}</td>
          <td class="py-1 px-2 hidden lg:table-cell text-left whitespace-nowrap">{{ item.media.metadata.publishedYear }}</td>
          <td class="py-1 px-2 hidden lg:table-cell text-left whitespace-nowrap">{{ item.media.duration ? $elapsedPretty(item.media.duration) : '' }}</td>
          <td class="py-1 px-2 hidden lg:table-cell text-left whitespace-nowrap">{{ item.size ? $bytesPretty(item.size) : '' }}</td>
          <td class="py-1 px-2 hidden lg:table-cell text-left whitespace-nowrap">{{ item.addedAt ? $formatDate(item.addedAt, 'yyyy-MM-dd') : '' }}</td>
          <td class="py-1 px-2 hidden xl:table-cell text-left whitespace-nowrap">{{ item.birthtimeMs ? $formatDate(item.birthtimeMs, 'yyyy-MM-dd') : '' }}</td>
          <td class="py-1 px-2 hidden xl:table-cell text-left whitespace-nowrap">{{ item.mtimeMs ? $formatDate(item.mtimeMs, 'yyyy-MM-dd') : '' }}</td>
        </tr>
      </tbody>
    </table>
    <div class="fixed right-4 bottom-4 z-50 flex items-center bg-primary border border-gray-600 rounded-full px-2 py-1 text-sm">
      <button class="w-6 h-6" aria-label="Smaller" @click="changeCoverSize(-10)">-</button>
      <span class="w-12 text-center">{{ coverSize }}</span>
      <button class="w-6 h-6" aria-label="Larger" @click="changeCoverSize(10)">+</button>
    </div>
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
    coverSize() {
      return this.settings.listCoverSize || 40
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
      const folder = (this.$store.getters['libraries/getCurrentLibrary']?.folders || []).find((f) => f.id === item.folderId)
      const root = (folder?.fullPath || '').split(/[\\/]/).filter(Boolean).pop()
      if (root) return root
      return (item.path || '').split(/[\\/]/).filter(Boolean).slice(0, 2).join('/')
    },
    changeCoverSize(delta) {
      const size = Math.min(200, Math.max(24, this.coverSize + delta))
      this.$store.dispatch('user/updateUserSettings', { listCoverSize: size })
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
