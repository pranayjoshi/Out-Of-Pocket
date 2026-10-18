import SwiftUI
import RelayCore
import UIKit

/// An inline placement shared by campus pages, outside student checkout flows.
struct CampusPromotionPlacement: View {
    @Environment(RelayStore.self) private var store
    @State private var sampleDetail: CampusPromotion?
    let placement: String

    var slot = "primary"

    private var promotion: CampusPromotion? {
        CampusPromotion.inline(in: store.promotions, campus: store.campus, placement: placement,
                               slot: slot, seed: store.promotionSessionSeed, dismissed: store.dismissedPromotionIDs)
    }

    var body: some View {
        if let promotion {
            CompactPromotionCard(promotion: promotion, placement: placement) { _ in sampleDetail = promotion }
                .sheet(item: $sampleDetail) { PromotionSampleDetail(promotion: $0) }
        }
    }
}

private struct CompactPromotionCard: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.openURL) private var openURL
    let promotion: CampusPromotion
    let placement: String
    let previewSample: (CampusPromotion) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Button {
                if promotion.sample == true { previewSample(promotion) }
                else if let destination = promotion.destination { openURL(destination) }
            } label: {
                HStack(alignment: .center, spacing: 10) {
                    PromotionArtwork(source: promotion.image, compact: true)
                        .frame(width: 52, height: 52)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(promotion.sample == true ? "SAMPLE" : "SPONSORED")
                            .font(.system(size: 9, weight: .semibold)).tracking(0.7)
                            .foregroundStyle(RelayTheme.secondary)
                        Text(promotion.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(promotion.sponsor).font(.caption2).foregroundStyle(RelayTheme.secondary).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("open-campus-promotion")
            .accessibilityLabel(promotion.title)
            Button { store.dismissedPromotionIDs.insert(promotion.id) } label: {
                Image(systemName: "xmark").font(.caption2.weight(.semibold)).frame(width: 28, height: 28)
            }
            .accessibilityLabel("Dismiss campus promotion")
        }
        .padding(8)
        .foregroundStyle(RelayTheme.ink)
        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(RelayTheme.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("campus-promotion-\(placement)")
    }
}

private struct PromotionArtwork: View {
    let source: String
    var compact = false
    @State private var decodedImage: UIImage?
    var body: some View {
        GeometryReader { geometry in
            Group {
                if let decodedImage { Image(uiImage: decodedImage).resizable().scaledToFill() }
                else if source.hasPrefix("/images/") {
                    Image(URL(fileURLWithPath: source).deletingPathExtension().lastPathComponent).resizable().scaledToFill()
                } else { RelayTheme.lime.overlay { Image(systemName: "leaf").font(compact ? .body : .largeTitle).foregroundStyle(RelayTheme.forest) } }
            }.frame(width: geometry.size.width, height: geometry.size.height).clipped()
        }
        .aspectRatio(compact ? 1 : 3, contentMode: .fit)
        .task(id: source) {
            decodedImage = nil
            guard source.hasPrefix("data:image/"), let separator = source.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(source[source.index(after: separator)...])) else { return }
            let image = await Task.detached(priority: .utility) { UIImage(data: data) }.value
            guard !Task.isCancelled else { return }
            decodedImage = image
        }
    }
}

private struct PromotionSampleDetail: View {
    @Environment(\.dismiss) private var dismiss
    let promotion: CampusPromotion
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    PromotionArtwork(source: promotion.image).clipShape(RoundedRectangle(cornerRadius: 18))
                    Eyebrow(text: "SAMPLE CAMPUS PROMOTION")
                    Text(promotion.title).font(RelayTheme.heading(30)).tracking(-1)
                    Text(promotion.description).foregroundStyle(RelayTheme.secondary)
                    Text(promotion.sponsor).font(.caption).foregroundStyle(RelayTheme.secondary)
                    DemoNotice(text: "This is an example ad. There is no live event registration, study enrollment, payment or offer.")
                    if let destination = promotion.destination {
                        Link(destination: destination) { Label("Visit university website", systemImage: "arrow.up.right") }
                            .buttonStyle(RelayPrimaryButton())
                    }
                }.padding(22)
            }.background(RelayTheme.paper).navigationTitle("Campus partner").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
