import WizardChatCore
import SwiftUI

struct RoomView: View {
    let room: RoomSummary
    let threadRoot: String?
    @StateObject private var timeline: TimelineModel
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.theme) private var theme

    init(room: RoomSummary, client: WizardClient, threadRoot: String? = nil) {
        self.room = room
        self.threadRoot = threadRoot
        _timeline = StateObject(wrappedValue: TimelineModel(client: client, roomId: room.id, threadRoot: threadRoot))
    }

    @State private var openThread: IdentifiedString?
    @State private var showThreads = false

    @State private var backAnchorVisible = false
    @State private var isAtBottom = true
    @State private var farFromBottom = false
    @State private var newWhileAway = 0
    @State private var userScrolledAway = false
    @State private var isUserScrolling = false
    @State private var dragStartGap: CGFloat?
    @State private var keyboardMoving = false
    @State private var fillsScreen = true
    @State private var loadingOlder = false
    /// Set once the chat has been scrolled to the newest message after opening. Until then
    /// the top placeholder can look "visible" during the first layout and must not load history.
    @State private var positioned = false
    @State private var stickToBottomForKeyboard = false
    @State private var composerTop: CGFloat = .infinity
    @State private var keyboardTop: CGFloat = .infinity
    /// Space under the newest message. The list runs under the composer down to the bottom of
    /// the window, or to the top of the keyboard while it's open, so it's the distance from the
    /// composer's top to there.
    private var visualBottomMargin: CGFloat {
        guard composerTop.isFinite, composerTop > 0 else { return 0 }
        return max(min(Self.windowHeight, keyboardTop) - composerTop, 0)
    }

    private static var windowHeight: CGFloat {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.keyWindow?.bounds.height ?? scene?.screen.bounds.height ?? 0
    }

    /// Space above the oldest message: the list starts at the top of the window, so it's
    /// where the navigation bar ends.
    private func visualTopMargin(_ outer: GeometryProxy) -> CGFloat {
        max(outer.frame(in: .global).minY, 0)
    }
    @State private var replyTo: ChatEntry?
    @State private var editing: ChatEntry?
    @State private var reactingTo: ChatEntry?
    @State private var menuTarget: MessageMenuTarget?
    @State private var afterMenu: (() -> Void)?
    @StateObject private var reactionPacks = PacksStore()
    @State private var showInfo = false
    @State private var canPin = false
    @State private var canRedactOthers = false
    @State private var reporting: ChatEntry?
    @State private var reportReason = ""
    @State private var sourceText: IdentifiedString?
    @State private var selectingText: IdentifiedString?
    @State private var linkPreviews: LinkPreviewLoader?
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var calls: CallManager
    @State private var profileUserId: String?
    @State private var highlightedId: String?
    @State private var unreadDividerId: String?

    private static let bottomId = "timeline-bottom"

    var body: some View {
        GeometryReader { outer in
            ScrollViewReader { proxy in
                timelineScroll(proxy)
                    // Flipped (newest first, at the visual bottom), so history and images
                    // loading in above can't move what you're reading. Safe areas are flipped
                    // too, so they're applied by hand: the composer at the visual bottom, the
                    // navigation bar at the visual top.
                    // Measured on screen (the keyboard moves the composer, not the list).
                    .contentMargins(.top, visualBottomMargin + 8, for: .scrollContent)
                    .contentMargins(.bottom, visualTopMargin(outer) + 8, for: .scrollContent)
                    .contentMargins(.top, visualBottomMargin, for: .scrollIndicators)
                    .contentMargins(.bottom, visualTopMargin(outer), for: .scrollIndicators)
                    .hidingScrollEdgeEffects()
                    .flippedVertically()
                    .ignoresSafeArea(.container, edges: .vertical)
                    .ignoresSafeArea(.keyboard)
                    .overlay(alignment: .top) {
                        Color.clear
                            .frame(height: WZ.Space.space0)
                            .background(theme.bgSecondary.ignoresSafeArea(.container, edges: .top))
                            .allowsHitTesting(false)
                    }

                    .overlay(alignment: .bottomTrailing) {
                        if userScrolledAway && !isAtBottom && (farFromBottom || newWhileAway > 0) {
                            JumpToNewestButton(newCount: newWhileAway) {
                                newWhileAway = 0
                                withAnimation(.easeOut(duration: WZ.MotionDuration.slow)) { scrollToNewest(proxy) }
                            }
                            .padding(.trailing, WZ.Space.space5)
                            .padding(.bottom, WZ.Space.space4)
                            .transition(.scale(scale: 0.6).combined(with: .opacity))
                        }
                    }
                    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                        keyboardMoving = true
                        stickToBottomForKeyboard = isAtBottom || !userScrolledAway
                    }
                    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                        keyboardMoving = true
                        keyboardTop = .infinity
                    }
                    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
                        guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
                        keyboardTop = frame.minY >= Self.windowHeight - 1 ? .infinity : frame.minY
                    }
                    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidHideNotification)) { _ in
                        keyboardMoving = false
                    }
                    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                        keyboardMoving = false
                        guard stickToBottomForKeyboard else { return }
                        withAnimation(.easeOut(duration: WZ.MotionDuration.normal)) { scrollToNewest(proxy) }
                    }
                    .onChange(of: notifier.eventToFocus?.eventId, initial: true) { _, _ in
                        guard threadRoot == nil, let focus = notifier.eventToFocus, focus.roomId == room.id else { return }
                        notifier.eventToFocus = nil
                        Task { await jump(to: focus.eventId, proxy) }
                    }
                    .onChange(of: timeline.entries.isEmpty, initial: true) { _, isEmpty in
                        guard !isEmpty, !positioned else { return }
                        positioned = true
                        Task {
                            if threadRoot == nil, room.unreadCount > 0 || room.mentionCount > 0 {
                                await openAtFirstUnread(proxy)
                            }
                            await timeline.markAsRead(sendReceipts: prefs.sendReadReceipts)
                        }
                    }
                    .onChange(of: timeline.entries.last?.id) { _, lastId in
                        guard lastId != nil, positioned else { return }
                        // Unless you scrolled up to read, follow new messages (the list can keep
                        // the previous one in place, leaving the new one just below). Your own
                        // always brings you back down.
                        if !userScrolledAway || timeline.entries.last?.isOwn == true {
                            newWhileAway = 0
                            withAnimation(.easeOut(duration: WZ.MotionDuration.normal)) { scrollToNewest(proxy) }
                        } else {
                            newWhileAway += 1
                        }
                        Task { await timeline.markAsRead(sendReceipts: prefs.sendReadReceipts) }
                    }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: WZ.Space.space0) {
            VStack(spacing: WZ.Space.space2) {
                if threadRoot != nil, timeline.reachedStart, timeline.entries.filter(\.isContent).count <= 1 {
                    Text(String(localized: "timeline.threadEmpty"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .frame(maxWidth: .infinity)
                }
                if threadRoot == nil, calls.isInCall, calls.room?.id != room.id || room.isDirect {
                    CallBar { calls.showCallScreen = true }
                        .padding(.horizontal, WZ.Space.space6)
                }
                IdentityWarning(roomId: room.id, client: timeline.client, encrypted: room.isEncrypted)
                if prefs.typingIndicators && !timeline.typingNames.isEmpty {
                    TypingIndicator(names: timeline.typingNames)
                }
                ComposerView(timeline: timeline, room: room, replyTo: $replyTo, editing: $editing, threadRoot: threadRoot) { typing in
                    if prefs.typingIndicators { timeline.setTyping(typing) }
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { composerTop = $0 }
        }
        .background(theme.bgSecondary.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(theme.bgSecondary, for: .navigationBar)
        .toolbarBackgroundVisibility(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if threadRoot != nil {
                    ThreadTitle(room: room)
                        .fixedSize()
                        .padding(.horizontal, WZ.Space.space6)
                        .padding(.vertical, WZ.Space.space2)
                        .frame(minHeight: WZ.Space.space10)
                        .floatingGlass(in: Capsule())
                } else {
                    Button { showInfo = true } label: {
                        RoomTitle(room: room)
                            .fixedSize()
                            .padding(.horizontal, WZ.Space.space6)
                            .padding(.vertical, WZ.Space.space2)
                            .frame(minHeight: WZ.Space.space10)
                            .floatingGlass(in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(String(localized: "timeline.showsRoomInfoMembers"))
                }
            }
            .glassBackgroundHidden()
            if threadRoot == nil {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showThreads = true } label: {
                        Image("ph-chat-dots-regular").foregroundStyle(theme.textPrimary)
                    }
                        .accessibilityLabel(String(localized: "timeline.threads"))
                    Menu {
                        Button { startCall(video: false) } label: {
                            Label(menu: String(localized: "timeline.voiceCall"), icon: "ph-phone-fill")
                        }
                        Button { startCall(video: true) } label: {
                            Label(menu: String(localized: "timeline.videoCall"), icon: "ph-video-camera-fill")
                        }
                    } label: {
                        Image("ph-phone-fill")
                    }
                    .accessibilityLabel(String(localized: "voice.startCall"))
                }
            }
        }
        .navigationDestination(item: $openThread) { root in
            RoomView(room: room, client: timeline.client, threadRoot: root.id)
        }
        .sheet(isPresented: $showThreads) {
            ThreadListView(room: room, client: timeline.client) { root in
                showThreads = false
                openThread = IdentifiedString(id: root)
            }
        }
        .overlay(alignment: .top) {
            if threadRoot == nil, !calls.isInCall(roomId: room.id),
               room.callParticipants.contains(where: { $0 != session.userId }) {
                JoinCallBar(room: room).padding(.top, WZ.Space.space3)
            }
        }
        .sheet(isPresented: $showInfo, onDismiss: { Task { await timeline.loadPinned() } }) {
            RoomInfoView(room: room, client: timeline.client) { eventId in
                showInfo = false
                notifier.eventToFocus = (room.id, eventId)
            }
        }
        .sheet(item: $sourceText) { source in SourceView(json: source.id) }
        .sheet(item: $selectingText) { text in SelectTextView(text: text.id) }
        .alert(String(localized: "timeline.reportMessage"), isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } })) {
            TextField(String(localized: "room.members.reasonLabel"), text: $reportReason)
            Button(String(localized: "timeline.reportShort"), role: .destructive) {
                guard let entry = reporting else { return }
                let reason = reportReason.isEmpty ? nil : reportReason
                reportReason = ""
                Task {
                    if await timeline.reportMessage(entry, reason: reason) {
                        CopyToast.shared.show(String(localized: "timeline.reported"))
                    }
                }
            }
            Button(String(localized: "common.cancel"), role: .cancel) { reportReason = "" }
        } message: {
            Text(String(localized: "timeline.yourHomeserverSAdmins"))
        }
        .task {
            let details = try? await timeline.client.roomDetails(roomId: room.id)
            if details?.isEncrypted == false {
                linkPreviews = LinkPreviewLoader(client: timeline.client)
            }
            if let permissions = details?.permissions {
                canPin = permissions.pin
                canRedactOthers = permissions.redactOthers
            }
        }
        .sheet(item: Binding(get: { profileUserId.map(IdentifiedString.init) }, set: { profileUserId = $0?.id })) { item in
            UserProfileSheet(userId: item.id, roomId: room.id)
        }
        .task { await timeline.start() }
        .fullScreenCover(item: $menuTarget, onDismiss: {
            afterMenu?()
            afterMenu = nil
        }) { target in
            MessageMenuOverlay(target: target, actions: actions, isPrivateRoom: room.isDirect) { then in
                afterMenu = then
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) { menuTarget = nil }
            }
            .presentationBackground(.clear)
        }
        .sheet(item: $reactingTo) { entry in
            MediaPicker(tab: .emoji, store: reactionPacks, onEmoji: { emoji, image in
                Task { await timeline.toggleReaction(image?.url ?? emoji, on: entry) }
            }, onSticker: { _ in }, onGif: { _ in }, emojiOnly: true)
            .task { await reactionPacks.load(session: session, roomId: room.id) }
        }
        .onAppear { if threadRoot == nil { notifier.activeRoomId = room.id } }
        .onDisappear {
            if threadRoot == nil, notifier.activeRoomId == room.id { notifier.activeRoomId = nil }
            timeline.setTyping(false)
        }
    }

    private func startCall(video: Bool) {
        calls.showCallScreen = true
        guard !calls.isInCall(roomId: room.id) else { return }
        Task { await calls.join(room, session: session, intent: video ? "video" : "audio", ring: true) }
    }

    private var actions: MessageActions {
        MessageActions(
            reply: { replyTo = $0; editing = nil },
            react: { key, entry in Task { await timeline.toggleReaction(key, on: entry) } },
            moreReactions: { reactingTo = $0 },
            edit: { editing = $0; replyTo = nil },
            delete: { entry in Task { await timeline.redact(entry) } },
            vote: { answer, entry in Task { await timeline.vote(answer, in: entry) } },
            endPoll: { entry in Task { await timeline.endPoll(entry) } },
            roomId: room.id,
            openProfile: { profileUserId = $0 },
            pinnedIds: timeline.pinnedIds,
            canPin: canPin,
            canRedactOthers: canRedactOthers,
            togglePin: { entry in Task { await timeline.togglePin(entry) } },
            report: { reporting = $0 },
            viewSource: { entry in Task { sourceText = await timeline.source(of: entry).map(IdentifiedString.init) } },
            selectText: { selectingText = IdentifiedString(id: $0.summary) },
            openThread: threadRoot != nil ? nil : { entry in openThread = entry.eventId.map(IdentifiedString.init) },
            linkPreviews: linkPreviews,
            retry: { timeline.retrySending() },
            openMenu: { entry, frame in
                // The menu fades in by itself; the cover's own slide-up would fight it
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) { menuTarget = MessageMenuTarget(entry: entry, frame: frame) }
            }
        )
    }

    private func timelineScroll(_ proxy: ScrollViewProxy) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: WZ.Space.space0) {
                Color.clear
                    .frame(height: WZ.Space.space0)
                    .id(Self.bottomId)
                ForEach(timeline.uploads.reversed()) { upload in
                    UploadingRow(upload: upload).flippedVertically()
                }
                ForEach(timeline.entries.reversed()) { entry in
                    VStack(spacing: WZ.Space.space0) {
                        if entry.id == unreadDividerId { NewMessagesDivider() }
                        TimelineRow(entry: entry, actions: actions, isPrivateRoom: room.isDirect)
                            .background(highlightedId == entry.id ? theme.accent.opacity(0.18) : .clear)
                    }
                        .flippedVertically()
                        .modifier(MessageContextMenu(entry: entry, actions: actions))
                        .id(entry.id)
                }
                Group {
                    if timeline.reachedStart && threadRoot != nil {
                        EmptyView()
                    } else if timeline.reachedStart {
                        TimelineStart(room: room)
                    } else {
                        // Skeleton rows that load the next page of history only once they
                        // actually scroll into view.
                        TimelinePlaceholder()
                    }
                }
                .flippedVertically()
            }
        }
        // Read the real scroll position: lazily built rows that leave the screen stop
        // reporting their own geometry, so they can't tell us what's visible.
        .onScrollGeometryChange(for: ScrollEdges.self) { geometry in
            ScrollEdges(geometry)
        } action: { _, edges in
            isAtBottom = edges.atBottom
            if edges.farFromBottom != farFromBottom {
                withAnimation(.spring(duration: WZ.MotionDuration.slow)) { farFromBottom = edges.farFromBottom }
            }
            if edges.atBottom || (!isUserScrolling && edges.bottomGap < 150) {
                newWhileAway = 0
                userScrolledAway = false
            } else if isUserScrolling, !keyboardMoving, let start = dragStartGap,
                      edges.bottomGap - start > 150 {
                userScrolledAway = true
            }
            backAnchorVisible = edges.nearTop
            fillsScreen = edges.fillsScreen
            // Load history only while you're scrolling up to it (or the chat is too short
            // to scroll), one page at a time, so it never runs away on its own.
            if edges.nearTop && (isUserScrolling || !edges.fillsScreen) { loadOlder() }
        }
        .scrollDismissesKeyboard(.interactively)
        .onScrollPhaseChange { _, phase, context in
            isUserScrolling = phase == .interacting || phase == .decelerating
            if phase == .interacting, dragStartGap == nil {
                dragStartGap = ScrollEdges(context.geometry).bottomGap
            } else if phase == .idle {
                dragStartGap = nil
            }
            if phase == .interacting, backAnchorVisible { loadOlder() }
        }
    }

    private func openAtFirstUnread(_ proxy: ScrollViewProxy) async {
        guard let id = await timeline.loadUntilReadMarker(),
              let index = timeline.entries.firstIndex(where: { $0.id == id }) else { return }
        unreadDividerId = id
        // A few new messages are visible from the bottom anyway; only jump for more.
        guard timeline.entries.count - index > 6 else { return }
        userScrolledAway = true
        try? await Task.sleep(for: .milliseconds(80))
        proxy.scrollTo(id, anchor: .bottom)
    }

    private func jump(to eventId: String, _ proxy: ScrollViewProxy) async {
        await timeline.start()
        guard await timeline.loadUntil(eventId: eventId),
              let entry = timeline.entries.first(where: { $0.eventId == eventId || $0.galleryItems.contains { $0.eventId == eventId } })
        else {
            CopyToast.shared.show(String(localized: "timeline.messageNotFound"))
            return
        }
        userScrolledAway = true
        try? await Task.sleep(for: .milliseconds(100))
        withAnimation(.easeOut(duration: WZ.MotionDuration.slow)) { proxy.scrollTo(entry.id, anchor: .center) }
        withAnimation { highlightedId = entry.id }
        try? await Task.sleep(for: .seconds(2))
        withAnimation(.easeOut(duration: 0.6)) { highlightedId = nil }
    }

    private func scrollToNewest(_ proxy: ScrollViewProxy) {
        proxy.scrollTo(Self.bottomId, anchor: .top)
    }

    /// Loads one page of older messages (80 events). They're added at the far
    /// end of the flipped list, so nothing on screen moves. Keeps going only while the chat
    /// is too short to fill the screen.
    private func loadOlder() {
        guard !loadingOlder, !timeline.reachedStart else { return }
        loadingOlder = true
        Task {
            defer { loadingOlder = false }
            repeat {
                await timeline.paginateBackwards()
                try? await Task.sleep(for: .milliseconds(80))
            } while !fillsScreen && !timeline.reachedStart && !Task.isCancelled
        }
    }
}

private struct ScrollEdges: Equatable {
    let nearTop: Bool
    let atBottom: Bool
    let farFromBottom: Bool
    let fillsScreen: Bool
    let bottomGap: CGFloat

    init(_ geometry: ScrollGeometry) {
        let bottomGap = geometry.contentOffset.y + geometry.contentInsets.top
        let topGap = geometry.contentSize.height + geometry.contentInsets.bottom
            - (geometry.contentOffset.y + geometry.containerSize.height)
        nearTop = topGap < 240
        self.bottomGap = bottomGap
        atBottom = bottomGap < 80
        farFromBottom = bottomGap > geometry.containerSize.height
        fillsScreen = geometry.contentSize.height + geometry.contentInsets.top + geometry.contentInsets.bottom
            > geometry.containerSize.height + 240
    }
}

private struct UploadingRow: View {
    let upload: PendingUpload
    @Environment(\.theme) private var theme

    private var size: CGSize {
        guard let preview = upload.preview else { return CGSize(width: 260, height: 72) }
        let scale = min(260 / max(preview.size.width, 1), 320 / max(preview.size.height, 1), 1)
        return CGSize(width: max(preview.size.width * scale, 60), height: max(preview.size.height * scale, 60))
    }

    var body: some View {
        HStack(alignment: .top, spacing: WZ.Space.space5) {
            Color.clear.frame(width: WZ.SizeAvatar.md, height: WZ.Space.space0)
            ZStack {
                if let preview = upload.preview {
                    Image(uiImage: preview).resizable().aspectRatio(contentMode: .fill)
                } else {
                    theme.fill
                }
                UploadProgressRing(progress: upload.progress)
            }
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, WZ.Space.space6)
        .padding(.vertical, WZ.Space.space1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.format("timeline.uploading", upload.filename))
        .accessibilityValue(upload.progress.map { "\(Int($0 * 100))%" } ?? "")
    }
}

private struct UploadProgressRing: View {
    @Environment(\.theme) private var theme
    let progress: Double?

    var body: some View {
        ZStack {
            Circle().fill(theme.overlay)
            if let progress {
                Circle().stroke(theme.textOnAccent.opacity(0.3), lineWidth: WZ.BorderWidth.thick)
                Circle()
                    .trim(from: 0, to: max(progress, 0.03))
                    .stroke(theme.textOnAccent, style: StrokeStyle(lineWidth: WZ.BorderWidth.thick, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeOut(duration: WZ.MotionDuration.normal), value: progress)
            } else {
                ProgressView().tint(theme.textOnAccent)
            }
        }
        .frame(width: WZ.Space.space10, height: WZ.Space.space10)
        .accessibilityLabel(String(localized: "attachment.uploading"))
        .accessibilityValue(progress.map { "\(Int($0 * 100))%" } ?? "")
    }
}

private struct NewMessagesDivider: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            Rectangle().fill(theme.danger).frame(height: WZ.Space.space0)
            Text(String(localized: "timeline.unreadMessages"))
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.danger)
                .fixedSize()
            Rectangle().fill(theme.danger).frame(height: WZ.Space.space0)
        }
        .padding(.horizontal, WZ.Space.space6)
        .padding(.vertical, WZ.Space.space4)
        .accessibilityElement(children: .combine)
    }
}

private struct JumpToNewestButton: View {
    let newCount: Int
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            Image("ph-caret-down-regular")
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .floatingGlass(in: Circle())
                .overlay(alignment: .top) {
                    if newCount > 0 {
                        Text(newCount > 99 ? "99+" : "\(newCount)")
                            .font(.wizard(WZ.FontSize.xs, .bold).monospacedDigit())
                            .foregroundStyle(theme.textOnAccent)
                            .padding(.horizontal, WZ.Space.space2)
                            .frame(minWidth: WZ.Space.space7, minHeight: WZ.Space.space7)
                            .background(theme.accent, in: Capsule())
                            .offset(y: -WZ.Space.space4)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(newCount > 0 ? L10n.format("timeline.jumpToNewestNew", newCount) : String(localized: "timeline.jumpToNewest"))
        .sensoryFeedback(.impact(weight: .light), trigger: newCount)
    }
}

private struct TimelinePlaceholder: View {
    @Environment(\.theme) private var theme
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space6) {
            row(0.55, 0.35)
            row(0.7, 0.5)
            row(0.45, 0.6)
        }
        .padding(.horizontal, WZ.Space.space6)
        .padding(.vertical, WZ.Space.space5)
        .opacity(pulse ? 1 : 0.5)
        .animation(.easeInOut(duration: 0.8).repeatForever(), value: pulse)
        .onAppear { pulse = true }
        .accessibilityLabel(String(localized: "timeline.loadingOlderMessages"))
    }

    private func row(_ first: CGFloat, _ second: CGFloat) -> some View {
        HStack(alignment: .top, spacing: WZ.Space.space5) {
            Circle().fill(theme.fill).frame(width: WZ.Space.space9, height: WZ.Space.space9)
            GeometryReader { geometry in
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    Capsule().fill(theme.fill).frame(width: geometry.size.width * first, height: WZ.Space.space5)
                    Capsule().fill(theme.fill).frame(width: geometry.size.width * second, height: WZ.Space.space5)
                }
            }
            .frame(height: WZ.Space.space9)
        }
    }
}

private struct ThreadTitle: View {
    let room: RoomSummary
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space0) {
            Text(String(localized: "thread.title"))
                .font(.wizard(WZ.FontSize.lg, .semibold))
                .foregroundStyle(theme.textPrimary)
            Text(room.displayName)
                .font(.wizard(WZ.FontSize.xs))
                .foregroundStyle(theme.textMuted)
        }
        .lineLimit(1)
        .frame(maxWidth: WZ.Size.sidebar)
    }
}

private struct RoomTitle: View {
    let room: RoomSummary
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space0) {
            HStack(spacing: WZ.Space.space1) {
                if !room.isDirect {
                    Image("ph-hash-straight-regular")
                        .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                        .foregroundStyle(theme.textMuted)
                }
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.lg, .semibold))
                    .foregroundStyle(theme.textPrimary)
            }
            if prefs.developerMode {
                Text(room.id)
                    .font(.system(size: WZ.SizeIcon.xs, design: .monospaced))
                    .foregroundStyle(theme.textSecondary)
                    .onTapGesture { copyToClipboard(room.id) }
            }
        }
        .lineLimit(1)
        .frame(maxWidth: WZ.Size.sidebar)
    }
}

private struct TimelineStart: View {
    let room: RoomSummary
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: WZ.Space.space4) {
            AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.xl)
                .padding(.bottom, WZ.Space.space2)
            Text(room.displayName)
                .font(.wizard(WZ.FontSize.xxl, .bold))
                .foregroundStyle(theme.textPrimary)
            Text(String(localized: "timeline.thisIsTheStart"))
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textMuted)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, WZ.Space.space6)
        .padding(.top, WZ.Space.space9)
        .padding(.bottom, WZ.Space.space5)
    }
}

private struct TimelineRow: View {
    let entry: ChatEntry
    let actions: MessageActions
    let isPrivateRoom: Bool
    @Environment(\.theme) private var theme

    var body: some View {
        switch entry.kind {
        case .dateDivider(let date):
            Text(Self.dateText(date))
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
                .frame(maxWidth: .infinity)
                .padding(.top, WZ.Space.space6)
                .padding(.bottom, WZ.Space.space3)
        case .system(let text):
            Text(text)
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, WZ.Space.space9)
                .padding(.vertical, WZ.Space.space1)
        default:
            MessageRow(entry: entry, actions: actions, isPrivateRoom: isPrivateRoom)
        }
    }

    private static func dateText(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return String(localized: "timeline.dateToday") }
        if Calendar.current.isDateInYesterday(date) { return String(localized: "timeline.dateYesterday") }
        return date.formatted(.dateTime.month(.wide).day().year())
    }
}

struct MessageRow: View {
    let entry: ChatEntry
    var actions: MessageActions?
    var isPrivateRoom = true
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @Environment(\.mediaLoader) private var mediaLoader
    @State private var spoilersRevealed = false
    @State private var showFailed = false
    @State private var swipe: CGFloat = 0
    private static let replyThreshold: CGFloat = 64

    private var scale: CGFloat { prefs.chatScale }
    private var spacing: CGFloat { prefs.chatSpacing }
    private var isClassic: Bool { prefs.messageLayout == .classic }


    private var isText: Bool {
        switch entry.kind {
        case .message, .redacted, .undecryptable: return true
        default: return false
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: WZ.Space.space5) {
            if entry.isGrouped {
                Color.clear.frame(width: WZ.SizeAvatar.md, height: WZ.Space.space0)
            } else {
                AvatarView(name: entry.senderName, url: entry.senderAvatarUrl, size: WZ.SizeAvatar.md)
                    .padding(.top, WZ.Space.space1)
                    .onTapGesture { actions?.openProfile(entry.sender) }
                    .accessibilityAddTraits(.isButton)
            }
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                if !entry.isGrouped {
                    HStack(alignment: .firstTextBaseline, spacing: WZ.Space.space4) {
                        Text(entry.senderName)
                            .font(.wizard(WZ.FontSize.md * scale, .semibold))
                            .foregroundStyle(theme.accent)
                            .lineLimit(1)
                            .onTapGesture { actions?.openProfile(entry.sender) }
                        Text(entry.timestamp, format: .dateTime.hour().minute())
                            .font(.wizard(WZ.FontSize.sm * scale))
                            .foregroundStyle(theme.textMuted)
                        if let eventId = entry.eventId, actions?.pinnedIds.contains(eventId) == true {
                            Image("ph-push-pin-regular")
                                .font(.system(size: WZ.SizeIcon.xs * scale, weight: .semibold))
                                .foregroundStyle(theme.textMuted)
                                .accessibilityLabel(String(localized: "timeline.pinned"))
                        }
                    }
                    .padding(.bottom, WZ.Space.space0)
                }
                if let quote = entry.replyTo {
                    ReplyQuoteView(quote: quote)
                }
                HStack(alignment: .bottom, spacing: WZ.Space.space3) {
                    messageContent
                        .opacity(entry.isSending && !entry.sendFailed && isText ? 0.5 : 1)
                        .overlay {
                            if entry.isSending && !entry.sendFailed && !isText {
                                UploadProgressRing(progress: nil)
                            }
                        }
                    if entry.sendFailed {
                        Button { showFailed = true } label: {
                            Image("ph-warning-circle-regular")
                                .font(.system(size: WZ.SizeIcon.md))
                                .foregroundStyle(theme.danger)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "timeline.notSent"))
                        .confirmationDialog(String(localized: "timeline.notSentTitle"), isPresented: $showFailed, titleVisibility: .visible) {
                            Button(String(localized: "composer.voice.retry")) { actions?.retry() }
                            Button(String(localized: "common.delete"), role: .destructive) { actions?.delete(entry) }
                        }
                    }
                }
                if let loader = actions?.linkPreviews, case .message(let body, _, _) = entry.kind,
                   let url = MessageText.firstPreviewURL(in: body) {
                    LinkPreviewCard(url: url, loader: loader)
                }
                if !entry.reactions.isEmpty {
                    ReactionsBar(reactions: entry.reactions) { key in actions?.react(key, entry) }
                }
                if let thread = entry.thread, thread.replies > 0, let actions, let openThread = actions.openThread {
                    ThreadSummaryBadge(thread: thread, roomId: actions.roomId) { openThread(entry) }
                }
                if !entry.readBy.isEmpty, let roomId = actions?.roomId {
                    ReadReceiptsView(roomId: roomId, userIds: entry.readBy, readAt: entry.readAt)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, WZ.Space.space5)
        }
        .padding(.horizontal, WZ.Space.space6)
        .padding(.top, (entry.isGrouped ? 1 : 6) * spacing)
        .padding(.bottom, (entry.isGrouped ? 1 : 2) * spacing)
        .offset(x: swipe)
        .background(alignment: .leading) {
            if swipe > 8 {
                Image("ph-arrow-bend-up-left-regular")
                    .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                    .foregroundStyle(swipe >= Self.replyThreshold ? theme.accent : theme.textMuted)
                    .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                    .background(theme.fill, in: Circle())
                    .scaleEffect(min(swipe / Self.replyThreshold, 1))
                    .padding(.leading, WZ.Space.space5)
            }
        }
        .gesture(swipeToReply)
        .sensoryFeedback(.impact(weight: .medium), trigger: swipe >= Self.replyThreshold)
    }

    @ViewBuilder
    private var messageContent: some View {
        if isText {
            textContent
                .font(.wizard(WZ.FontSize.lg * scale))
                .lineSpacing(3 * scale)
                .tint(isClassic && entry.isOwn && theme.colorScheme == .dark ? theme.textOnAccent : theme.linkColor)
                .padding(.horizontal, isClassic ? WZ.Space.space5 : 0)
                .padding(.vertical, isClassic ? WZ.Space.space4 : 0)
                .background {
                    if isClassic {
                        RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous)
                            .fill(entry.isOwn ? theme.msgMineBg : theme.msgOtherBg)
                    }
                }
        } else {
            mediaContent
        }
    }

    private var swipeToReply: SwipeToReplyGesture {
        SwipeToReplyGesture { dx in
            guard actions != nil, entry.canBeRepliedTo, entry.itemKey != nil else { return }
            swipe = min(max(dx, 0) * 0.6, Self.replyThreshold + 20)
        } onEnd: {
            if swipe >= Self.replyThreshold { actions?.reply(entry) }
            withAnimation(.spring(duration: WZ.MotionDuration.slow)) { swipe = 0 }
        }
    }

    @ViewBuilder
    private var textContent: some View {
        switch entry.kind {
        case .message(let body, let isEmote, let isNotice):
            (Text(MessageText.hidingSpoilers(
                MessageText.withMentions(
                    MessageText.attributed(isEmote ? "* \(entry.senderName) \(body)" : body,
                                           prettifyLinks: prefs.prettifyLinks),
                    entry.mentions, theme: theme),
                spoilers: spoilersRevealed ? [] : entry.spoilers, cover: theme.textMuted))
                .foregroundColor(isNotice ? theme.textMuted : theme.textPrimary)
                .italic(isEmote)
             + Text(entry.isEdited ? String(localized: "timeline.edited") : "")
                .font(.wizard(WZ.FontSize.xs * scale))
                .foregroundColor(theme.textMuted))
                .environment(\.openURL, OpenURLAction { url in
                    guard let userId = MessageText.mentionedUser(url) else { return .systemAction }
                    actions?.openProfile(userId)
                    return .handled
                })
                .onTapGesture { if !entry.spoilers.isEmpty { withAnimation { spoilersRevealed.toggle() } } }
                .accessibilityHint(entry.spoilers.isEmpty || spoilersRevealed ? "" : String(localized: "timeline.containsASpoilerTap"))
        case .redacted:
            Label(String(localized: "timeline.messageDeleted"), image: "ph-trash-regular")
                .foregroundStyle(theme.textMuted)
                .italic()
        case .undecryptable:
            Label(String(localized: "timeline.waitingForThisMessage"), image: "ph-lock-regular")
                .foregroundStyle(theme.textMuted)
                .italic()
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private var mediaContent: some View {
        switch entry.kind {
        case .image(let media):
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                if entry.galleryItems.count >= 2 {
                    GalleryGridView(items: entry.galleryItems, isPrivateRoom: isPrivateRoom)
                } else {
                    ImageMessageView(media: media, isPrivateRoom: isPrivateRoom, spoiler: entry.mediaSpoiler)
                }
                if let caption = media.caption { Text(caption).font(.wizard(WZ.FontSize.lg * scale)).foregroundStyle(theme.textPrimary) }
            }
        case .sticker(let media):
            ImageMessageView(media: media, isSticker: true, isPrivateRoom: isPrivateRoom)
        case .video(let media):
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                VideoMessageView(media: media, spoiler: entry.mediaSpoiler)
                if let caption = media.caption { Text(caption).font(.wizard(WZ.FontSize.lg * scale)).foregroundStyle(theme.textPrimary) }
            }
        case .audio(let media, let isVoice, let waveform):
            AudioMessageView(media: media, isVoice: isVoice, waveform: waveform)
        case .file(let media):
            FileMessageView(media: media)
        case .location(_, let geoUri, let description):
            LocationMessageView(geoUri: geoUri, description: description)
        case .poll(let poll):
            PollMessageView(poll: poll, isOwn: entry.isOwn,
                            onVote: { actions?.vote($0, entry) }, onEnd: { actions?.endPoll(entry) })
        default:
            EmptyView()
        }
    }
}

private struct MenuPressGesture: UIGestureRecognizerRepresentable {
    let action: () -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let press = UILongPressGestureRecognizer()
        press.minimumPressDuration = 0.35
        press.delegate = context.coordinator
        return press
    }

    func handleUIGestureRecognizerAction(_ recognizer: UILongPressGestureRecognizer, context: Context) {
        if recognizer.state == .began { action() }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizer(_ recognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}

/// Starts only on a clearly sideways drag to the right, so vertical drags always scroll
struct SwipeToReplyGesture: UIGestureRecognizerRepresentable {
    let onChange: (CGFloat) -> Void
    let onEnd: () -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        switch recognizer.state {
        case .changed: onChange(recognizer.translation(in: recognizer.view).x)
        case .ended, .cancelled, .failed: onEnd()
        default: break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return true }
            let velocity = pan.velocity(in: pan.view)
            return velocity.x > 0 && abs(velocity.x) > abs(velocity.y) * 1.6
        }
    }
}

private final class FrameBox {
    var value = CGRect.zero
}

private struct MessageContextMenu: ViewModifier {
    let entry: ChatEntry
    let actions: MessageActions
    @State private var frame = FrameBox()

    func body(content: Content) -> some View {
        if entry.isContent {
            content
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { [frame] in frame.value = $0 }
                .gesture(MenuPressGesture { [frame] in actions.openMenu(entry, frame.value) })
        } else {
            content
        }
    }
}

struct MessageActions {
    let reply: (ChatEntry) -> Void
    let react: (String, ChatEntry) -> Void
    let moreReactions: (ChatEntry) -> Void
    let edit: (ChatEntry) -> Void
    let delete: (ChatEntry) -> Void
    let vote: (String, ChatEntry) -> Void
    let endPoll: (ChatEntry) -> Void
    let roomId: String
    let openProfile: (String) -> Void
    var pinnedIds: Set<String> = []
    var canPin = false
    var canRedactOthers = false
    var togglePin: (ChatEntry) -> Void = { _ in }
    var report: (ChatEntry) -> Void = { _ in }
    var viewSource: (ChatEntry) -> Void = { _ in }
    var selectText: (ChatEntry) -> Void = { _ in }
    var openThread: ((ChatEntry) -> Void)?
    /// Set only in unencrypted rooms (see `LinkPreviewLoader`).
    var linkPreviews: LinkPreviewLoader?
    var retry: () -> Void = {}
    var openMenu: (ChatEntry, CGRect) -> Void = { _, _ in }
}

enum MessageText {
    private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    private final class Cached {
        let value: AttributedString
        init(_ value: AttributedString) { self.value = value }
    }

    private static let cache = NSCache<NSString, Cached>()

    static func attributed(_ text: String, prettifyLinks: Bool) -> AttributedString {
        let key = "\(prettifyLinks ? 1 : 0)\(text)" as NSString
        if let cached = cache.object(forKey: key) { return cached.value }
        let result = detectLinks(text, prettifyLinks: prettifyLinks)
        cache.setObject(Cached(result), forKey: key)
        return result
    }

    private static func detectLinks(_ text: String, prettifyLinks: Bool) -> AttributedString {
        guard let detector else { return AttributedString(text) }
        let ns = text as NSString
        var result = AttributedString()
        var cursor = 0
        for match in detector.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let url = match.url else { continue }
            if match.range.location > cursor {
                result += AttributedString(ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor)))
            }
            let original = ns.substring(with: match.range)
            var link = AttributedString(prettifyLinks ? prettified(url) ?? original : original)
            link.link = url
            result += link
            cursor = match.range.location + match.range.length
        }
        if cursor < ns.length {
            result += AttributedString(ns.substring(from: cursor))
        }
        return result
    }

    /// Mention pills: accent for others, the mention colour for you and @room
    static func withMentions(_ text: AttributedString, _ mentions: [MessageMention], theme: WizardTheme) -> AttributedString {
        var text = text
        var cursor = text.startIndex
        for mention in mentions {
            guard let range = text[cursor...].range(of: mention.label) else { continue }
            let color = mention.isOwn ? theme.mention : theme.accent
            text[range].foregroundColor = color
            text[range].backgroundColor = color.opacity(0.18)
            text[range].inlinePresentationIntent = .stronglyEmphasized
            text[range].link = URL(string: "https://matrix.to/#/\(mention.userId)")
            cursor = range.upperBound
        }
        var searchStart = text.startIndex
        while let range = text[searchStart...].range(of: "@room") {
            text[range].foregroundColor = theme.mention
            text[range].backgroundColor = theme.mention.opacity(0.16)
            text[range].inlinePresentationIntent = .stronglyEmphasized
            searchStart = range.upperBound
        }
        return text
    }

    static func mentionedUser(_ url: URL) -> String? {
        guard url.host() == "matrix.to", let fragment = url.fragment(), fragment.hasPrefix("/@") else { return nil }
        return String(fragment.dropFirst())
    }

    private static func prettified(_ url: URL) -> String? {
        guard url.scheme == "http" || url.scheme == "https", var host = url.host() else { return nil }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        return host
    }
}

private struct TypingIndicator: View {
    let names: [String]
    @Environment(\.theme) private var theme

    var body: some View {
        Text(text)
            .font(.wizard(WZ.FontSize.sm, .medium))
            .foregroundStyle(theme.textMuted)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, WZ.Space.space8)
    }

    private var text: String {
        switch names.count {
        case 1: return L10n.format("timeline.oneTyping", "\(names[0])")
        case 2: return L10n.format("timeline.twoTyping", "\(names[0])", "\(names[1])")
        default: return String(localized: "timeline.typingMany")
        }
    }
}


extension View {
    @ViewBuilder
    func hidingScrollEdgeEffects() -> some View {
        if #available(iOS 26, *) {
            scrollEdgeEffectHidden(true, for: .all)
        } else {
            self
        }
    }

    func flippedVertically() -> some View { scaleEffect(x: 1, y: -1, anchor: .center) }
}
