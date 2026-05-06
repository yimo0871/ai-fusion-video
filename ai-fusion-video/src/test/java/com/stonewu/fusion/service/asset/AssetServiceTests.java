package com.stonewu.fusion.service.asset;

import com.stonewu.fusion.common.BusinessException;
import com.stonewu.fusion.entity.asset.Asset;
import com.stonewu.fusion.entity.asset.AssetItem;
import com.stonewu.fusion.mapper.asset.AssetItemMapper;
import com.stonewu.fusion.mapper.asset.AssetMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssetServiceTests {

    @Mock
    private AssetMapper assetMapper;

    @Mock
    private AssetItemMapper assetItemMapper;

    @InjectMocks
    private AssetService assetService;

    @Test
        void createRejectsBase64CoverUrl() {
        Asset asset = Asset.builder()
                .projectId(1L)
                .type("character")
                .name("角色 A")
                .coverUrl(dataUrl("image/png", "cover-image"))
                .sourceType(1)
                .build();

        assertThatThrownBy(() -> assetService.create(asset))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("coverUrl 不支持 base64");
    }

    @Test
    void updateKeepsNormalCoverUrlUntouched() {
        when(assetMapper.selectById(7L)).thenReturn(Asset.builder().id(7L).build());

        Asset asset = Asset.builder()
                .id(7L)
                .coverUrl("https://example.com/cover.png")
                .build();

        assetService.update(asset);

        ArgumentCaptor<Asset> assetCaptor = ArgumentCaptor.forClass(Asset.class);
        verify(assetMapper).updateById(assetCaptor.capture());
        assertThat(assetCaptor.getValue().getCoverUrl()).isEqualTo("https://example.com/cover.png");
    }

    @Test
    void updateItemRejectsBase64ImageAndThumbnail() {
        when(assetItemMapper.selectById(9L)).thenReturn(AssetItem.builder()
                .id(9L)
                .assetId(3L)
                .itemType("variant")
                .build());

        AssetItem item = AssetItem.builder()
                .id(9L)
                .imageUrl(dataUrl("image/jpeg", "item-image"))
                .thumbnailUrl(dataUrl("image/webp", "thumb-image"))
                .build();

        assertThatThrownBy(() -> assetService.updateItem(item))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("imageUrl 不支持 base64");
    }

    private static String dataUrl(String mimeType, String ignoredValue) {
        return "data:" + mimeType + ";base64,dGVzdA==";
    }
}