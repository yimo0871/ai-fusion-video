package com.stonewu.fusion.service.ai;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.stonewu.fusion.entity.ai.AiModel;
import com.stonewu.fusion.entity.ai.ApiConfig;
import com.stonewu.fusion.mapper.ai.AiModelMapper;
import com.stonewu.fusion.service.ai.agentscope.AgentScopeModelFactory;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiModelServiceTests {

    @BeforeAll
    static void initMybatisPlusTableInfo() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), AiModel.class);
    }

    @Mock
    private AiModelMapper aiModelMapper;

    @Mock
    private ApiConfigService apiConfigService;

    @Mock
    private ModelPresetService modelPresetService;

    @Mock
    private ChatModelFactory chatModelFactory;

    @Mock
    private AgentScopeModelFactory agentScopeModelFactory;

    @InjectMocks
    private AiModelService aiModelService;

    @Test
    void createAiModelShouldClearOtherDefaultsWhenSavedAsDefault() {
        AiModel model = AiModel.builder()
                .name("Flux Kontext")
                .code("flux-kontext")
                .modelType(2)
                .apiConfigId(1L)
                .defaultModel(true)
                .build();
        when(apiConfigService.getById(1L)).thenReturn(ApiConfig.builder().id(1L).name("OpenAI Compatible").build());
        doAnswer(invocation -> {
            AiModel inserted = invocation.getArgument(0);
            inserted.setId(101L);
            return 1;
        }).when(aiModelMapper).insert(model);

        Long id = aiModelService.createAiModel(model);

        assertEquals(101L, id);
        verifyClearOtherDefaults(2, 101L);
    }

    @Test
    void updateAiModelShouldClearOtherDefaultsWhenMarkedAsDefault() {
        AiModel existing = AiModel.builder()
                .id(202L)
                .name("Wan 2.2")
                .code("wan-2.2")
                .modelType(3)
                .apiConfigId(1L)
                .defaultModel(false)
                .build();
        when(aiModelMapper.selectById(202L)).thenReturn(existing);

        aiModelService.updateAiModel(202L, null, null, null, null, null,
                null, null, null, true,
                null, null, null, null, null);

        assertTrue(existing.getDefaultModel());
        verify(aiModelMapper).updateById(existing);
        verify(chatModelFactory).evict(202L);
        verify(agentScopeModelFactory).evict(202L);
        verifyClearOtherDefaults(3, 202L);
    }

    private void verifyClearOtherDefaults(int expectedModelType, long excludeId) {
        @SuppressWarnings("rawtypes")
        ArgumentCaptor<LambdaUpdateWrapper> wrapperCaptor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);

        verify(aiModelMapper).update(isNull(), wrapperCaptor.capture());

        LambdaUpdateWrapper<?> wrapper = wrapperCaptor.getValue();
        assertThat(wrapper.getSqlSet()).contains("default_model");
        assertThat(wrapper.getSqlSegment()).contains("default_model")
                .contains("model_type")
                .contains("id");
        assertThat(wrapper.getParamNameValuePairs().values())
                .contains(expectedModelType, excludeId, true, false);
    }
}