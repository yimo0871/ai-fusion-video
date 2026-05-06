package com.stonewu.fusion.service.project;

import com.stonewu.fusion.common.BusinessException;
import com.stonewu.fusion.entity.project.Project;
import com.stonewu.fusion.mapper.asset.AssetItemMapper;
import com.stonewu.fusion.mapper.asset.AssetMapper;
import com.stonewu.fusion.mapper.project.ProjectMapper;
import com.stonewu.fusion.mapper.project.ProjectMemberMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectServiceTests {

    @Mock
    private ProjectMapper projectMapper;

    @Mock
    private ProjectMemberMapper memberMapper;

    @Mock
    private AssetMapper assetMapper;

    @Mock
    private AssetItemMapper assetItemMapper;

    @InjectMocks
    private ProjectService projectService;

    @Test
    void createRejectsBase64ProjectImages() {
        Project project = Project.builder()
                .name("测试项目")
                .coverUrl(dataUrl("image/png"))
                .artStyleImageUrl(dataUrl("image/jpeg"))
                .build();

        assertThatThrownBy(() -> projectService.create(project))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("coverUrl 不支持 base64");
    }

    @Test
    void updateKeepsNormalImageUrlsUntouched() {
        when(projectMapper.selectById(5L)).thenReturn(Project.builder().id(5L).build());

        Project project = Project.builder()
                .id(5L)
                .coverUrl("https://example.com/project-cover.png")
                .artStyleImageUrl("/media/images/style.png")
                .build();

        projectService.update(project);

        ArgumentCaptor<Project> projectCaptor = ArgumentCaptor.forClass(Project.class);
        verify(projectMapper).updateById(projectCaptor.capture());
        assertThat(projectCaptor.getValue().getCoverUrl()).isEqualTo("https://example.com/project-cover.png");
        assertThat(projectCaptor.getValue().getArtStyleImageUrl()).isEqualTo("/media/images/style.png");
    }

    private static String dataUrl(String mimeType) {
        return "data:" + mimeType + ";base64,dGVzdA==";
    }
}